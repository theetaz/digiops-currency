package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateRequestsAllowsSignedSubmission(t *testing.T) {
	methods, err := validateRequests([]byte(`{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0x01"],"id":1}`))
	if err != nil {
		t.Fatalf("validateRequests returned an error: %v", err)
	}
	if len(methods) != 1 || methods[0] != "eth_sendRawTransaction" {
		t.Fatalf("unexpected methods: %v", methods)
	}
}

func TestValidateRequestsRejectsNodeSideSigning(t *testing.T) {
	_, err := validateRequests([]byte(`{"jsonrpc":"2.0","method":"eth_sendTransaction","params":[],"id":1}`))
	if err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Fatalf("expected method rejection, got: %v", err)
	}
}

func TestValidateRequestsRejectsPrivilegedNamespace(t *testing.T) {
	_, err := validateRequests([]byte(`{"jsonrpc":"2.0","method":"admin_stopHTTP","params":[],"id":1}`))
	if err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Fatalf("expected method rejection, got: %v", err)
	}
}

func TestHostAllowlistHandlesPort(t *testing.T) {
	f := &filter{allowedHosts: parseAllowlist("rpc.example.com")}
	request := httptest.NewRequest("POST", "http://rpc.example.com/", nil)
	request.Host = "rpc.example.com:443"
	if !f.hostAllowed(request.Host) {
		t.Fatal("expected host with an approved name and port to be allowed")
	}
}
