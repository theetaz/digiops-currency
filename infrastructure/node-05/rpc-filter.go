package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	listenAddress = "0.0.0.0:8545"
	upstreamURL   = "http://127.0.0.1:8546"
	maxBodyBytes  = 1 << 20
	maxBatchSize  = 20
)

var allowedMethods = map[string]struct{}{
	"eth_blockNumber":                         {},
	"eth_call":                                {},
	"eth_chainId":                             {},
	"eth_estimateGas":                         {},
	"eth_feeHistory":                          {},
	"eth_gasPrice":                            {},
	"eth_getBalance":                          {},
	"eth_getBlockByHash":                      {},
	"eth_getBlockByNumber":                    {},
	"eth_getBlockTransactionCountByHash":      {},
	"eth_getBlockTransactionCountByNumber":    {},
	"eth_getCode":                             {},
	"eth_getLogs":                             {},
	"eth_getStorageAt":                        {},
	"eth_getTransactionByBlockHashAndIndex":   {},
	"eth_getTransactionByBlockNumberAndIndex": {},
	"eth_getTransactionByHash":                {},
	"eth_getTransactionCount":                 {},
	"eth_getTransactionReceipt":               {},
	"eth_maxPriorityFeePerGas":                {},
	"eth_sendRawTransaction":                  {},
	"eth_syncing":                             {},
	"net_listening":                           {},
	"net_peerCount":                           {},
	"net_version":                             {},
	"web3_clientVersion":                      {},
	"web3_sha3":                               {},
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type filter struct {
	client         *http.Client
	allowedHosts   map[string]struct{}
	allowedOrigins map[string]struct{}
}

func main() {
	f := &filter{
		client:         &http.Client{Timeout: 60 * time.Second},
		allowedHosts:   parseAllowlist(os.Getenv("NODE_HOST")),
		allowedOrigins: parseAllowlist(os.Getenv("WALLET_ORIGIN")),
	}
	if len(f.allowedHosts) == 0 {
		log.Fatal("NODE_HOST must contain at least one approved RPC host")
	}

	server := &http.Server{
		Addr:              listenAddress,
		Handler:           f,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      65 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	log.Printf("restricted JSON-RPC ingress listening on %s", listenAddress)
	log.Fatal(server.ListenAndServe())
}

func parseAllowlist(value string) map[string]struct{} {
	result := make(map[string]struct{})
	for _, item := range strings.Split(value, ",") {
		item = strings.ToLower(strings.TrimSpace(item))
		if item != "" {
			result[item] = struct{}{}
		}
	}
	return result
}

func (f *filter) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/healthz" && r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
		return
	}

	if !f.hostAllowed(r.Host) {
		http.Error(w, "host not allowed", http.StatusForbidden)
		return
	}

	origin := strings.ToLower(strings.TrimSpace(r.Header.Get("Origin")))
	if origin != "" {
		if _, ok := f.allowedOrigins[origin]; !ok {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost || r.URL.Path != "/" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	methods, err := validateRequests(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	request, err := http.NewRequestWithContext(r.Context(), http.MethodPost, upstreamURL, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "unable to create upstream request", http.StatusInternalServerError)
		return
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := f.client.Do(request)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			http.Error(w, "upstream timeout", http.StatusGatewayTimeout)
		} else {
			http.Error(w, "upstream unavailable", http.StatusBadGateway)
		}
		return
	}
	defer response.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(response.Body, maxBodyBytes+1))
	log.Printf("forwarded JSON-RPC methods=%s status=%d", strings.Join(methods, ","), response.StatusCode)
}

func (f *filter) hostAllowed(hostport string) bool {
	host := strings.ToLower(strings.TrimSpace(hostport))
	if parsed, _, err := net.SplitHostPort(host); err == nil {
		host = parsed
	}
	_, ok := f.allowedHosts[host]
	return ok
}

func validateRequests(body []byte) ([]string, error) {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return nil, errors.New("empty JSON-RPC request")
	}

	var requests []rpcRequest
	if trimmed[0] == '[' {
		if err := json.Unmarshal(trimmed, &requests); err != nil {
			return nil, errors.New("invalid JSON-RPC batch")
		}
		if len(requests) == 0 || len(requests) > maxBatchSize {
			return nil, errors.New("JSON-RPC batch size is not allowed")
		}
	} else {
		var request rpcRequest
		if err := json.Unmarshal(trimmed, &request); err != nil {
			return nil, errors.New("invalid JSON-RPC request")
		}
		requests = []rpcRequest{request}
	}

	methods := make([]string, 0, len(requests))
	for _, request := range requests {
		if request.JSONRPC != "2.0" || request.Method == "" {
			return nil, errors.New("invalid JSON-RPC envelope")
		}
		if _, ok := allowedMethods[request.Method]; !ok {
			return nil, errors.New("JSON-RPC method is not allowed")
		}
		methods = append(methods, request.Method)
	}
	return methods, nil
}
