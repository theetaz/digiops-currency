// Copyright (c) 2023, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.

import React, { useState, useEffect } from "react";
import { Avatar } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightOutlined,
  LoadingOutlined,
  SendOutlined,
  WarningFilled,
} from "@ant-design/icons";
import Wso2MainImg from "../../assets/images/pulse-orange.png";
import { useLocation, useNavigate } from "react-router-dom";
import "./ConfirmSendAssets.css";
import { getLocalDataAsync, saveLocalDataAsync } from "../../helpers/storage";
import { transferToken } from "../../services/blockchain.service";
import { getEllipsisTxt } from "../../helpers/formatter";
import {
  ERROR,
  ERROR_FETCHING_LOCAL_TX_DETAILS,
  ERROR_RESETTING_TX_VALUES,
  ERROR_TRANSFERRING_TOKEN,
  ERROR_BRIDGE_NOT_READY,
  OK,
  SUCCESS,
  SUCCESS_TOKEN_TRANSFER,
  WSO2_TOKEN,
} from "../../constants/strings";
import { STORAGE_KEYS } from "../../constants/configs";
import { showToast, showAlertBox } from "../../helpers/alerts";
import { waitForBridge } from "../../helpers/bridge";
import { completeParkingPayment } from "../../helpers/parkingPaymentFlow";
import { requestOpenMicroApp } from "../../microapp-bridge";

function ConfirmSendAssets() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [fromAddress, setFromAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [isTransferLoading, setIsTransferLoading] = useState(false);
  const [parkingFlowData, setParkingFlowData] = useState(null);

  const fetchLocalTxDetails = async () => {
    try {
      const sendingAmount = await getLocalDataAsync(
        STORAGE_KEYS.SENDING_AMOUNT,
      );
      const senderWalletAddress = await getLocalDataAsync(
        STORAGE_KEYS.SENDER_WALLET_ADDRESS,
      );
      const walletAddress = await getLocalDataAsync(
        STORAGE_KEYS.WALLET_ADDRESS,
      );

      setSendAmount(sendingAmount);
      setSenderAddress(senderWalletAddress);
      setFromAddress(walletAddress);
    } catch (error) {
      console.log(`${ERROR_FETCHING_LOCAL_TX_DETAILS}: ${error}`);
    }
  };

  useEffect(() => {
    const stateData = location?.state?.isParkingPaymentFlow
      ? {
          returnAppId: location?.state?.returnAppId,
          returnRoute: location?.state?.returnRoute,
        }
      : null;

    if (stateData) {
      setParkingFlowData({
        returnAppId: stateData?.returnAppId || "",
        returnRoute: stateData?.returnRoute || "",
      });
    }
  }, [location]);

  useEffect(() => {
    fetchLocalTxDetails();
  }, []);

  const resetInputFields = async () => {
    try {
      await saveLocalDataAsync(STORAGE_KEYS.SENDING_AMOUNT, "");
      await saveLocalDataAsync(STORAGE_KEYS.SENDER_WALLET_ADDRESS, "");
    } catch (error) {
      console.log(`${ERROR_RESETTING_TX_VALUES}: ${error}`);
    }
  };

  const handleReject = async () => {
    await resetInputFields();
    if (parkingFlowData) {
      await completeParkingPayment({
        status: "FAILED",
        error: "User cancelled payment",
        saveLocalDataAsync,
        requestOpenMicroApp,
        returnAppId: parkingFlowData.returnAppId,
        returnRoute: parkingFlowData.returnRoute,
      });
      return;
    }
    navigate("/send");
  };

  const handleConfirm = async () => {
    try {
      const isBridgeReady = await waitForBridge();
      if (!isBridgeReady) {
        console.error(ERROR_BRIDGE_NOT_READY);
        showAlertBox(ERROR, ERROR_BRIDGE_NOT_READY, OK);
        return;
      }

      setIsTransferLoading(true);
      const receipt = await transferToken(senderAddress, sendAmount);
      if (receipt) {
        await resetInputFields();

        if (fromAddress) {
          const cachedBalance = queryClient.getQueryData([
            "walletBalance",
            fromAddress,
          ]);
          const balanceNum = Number(cachedBalance);
          const amountNum = Number(sendAmount);
          if (
            cachedBalance != null &&
            Number.isFinite(balanceNum) &&
            Number.isFinite(amountNum)
          ) {
            const optimistic = Math.max(0, balanceNum - amountNum).toString();
            queryClient.setQueryData(
              ["walletBalance", fromAddress],
              optimistic,
            );
          }

          queryClient.invalidateQueries({
            queryKey: ["transactions", fromAddress],
          });
          queryClient.invalidateQueries({
            queryKey: ["walletBalance", fromAddress],
          });
        }

        if (parkingFlowData) {
          await completeParkingPayment({
            status: "SUCCESS",
            txHash: receipt?.transactionHash || "",
            saveLocalDataAsync,
            requestOpenMicroApp,
            returnAppId: parkingFlowData.returnAppId,
            returnRoute: parkingFlowData.returnRoute,
          });
          setIsTransferLoading(false);
          return;
        }

        showToast(SUCCESS, SUCCESS_TOKEN_TRANSFER);
        setTimeout(() => {
          navigate("/");
        }, 500);
      }
      setIsTransferLoading(false);
    } catch (error) {
      console.log("error while transferring token", error);

      if (parkingFlowData) {
        try {
          await completeParkingPayment({
            status: "FAILED",
            error: ERROR_TRANSFERRING_TOKEN,
            saveLocalDataAsync,
            requestOpenMicroApp,
            returnAppId: parkingFlowData.returnAppId,
            returnRoute: parkingFlowData.returnRoute,
          });
        } catch (parkingError) {
          console.log(
            "error while reporting parking payment failure",
            parkingError,
          );
        }
      }

      showAlertBox(ERROR, ERROR_TRANSFERRING_TOKEN, OK);
      setIsTransferLoading(false);
    }
  };

  const isParkingFlow = !!parkingFlowData;

  return (
    <div className="confirm-page">
      <div className="confirm-hero">
        <div className="confirm-hero-label">You're sending</div>
        <div className="confirm-hero-amount">{sendAmount || "—"}</div>
        <div className="confirm-hero-chip">
          <Avatar size={22} src={Wso2MainImg} />
          <span className="confirm-hero-chip-text">{WSO2_TOKEN}</span>
        </div>
      </div>

      <div className="confirm-card">
        <div className="confirm-from-to">
          <div className="confirm-addr-blk">
            <div className="confirm-addr-lbl">From</div>
            <div className="confirm-addr-val">
              {fromAddress ? getEllipsisTxt(fromAddress, 6) : "—"}
            </div>
          </div>
          <div className="confirm-arrow-sep">
            <ArrowRightOutlined style={{ fontSize: 12, color: "#9CA3AF" }} />
          </div>
          <div className="confirm-addr-blk confirm-addr-blk-right">
            <div className="confirm-addr-lbl">To</div>
            <div className="confirm-addr-val">
              {senderAddress ? getEllipsisTxt(senderAddress, 6) : "—"}
            </div>
          </div>
        </div>

        <div className="confirm-total-row">
          <span className="confirm-total-lbl">Total</span>
          <div className="confirm-total-val">
            <span className="confirm-total-num">{sendAmount || "—"}</span>
            <div className="confirm-ticker-pill">
              <Avatar size={20} src={Wso2MainImg} />
              <span className="confirm-ticker-text">{WSO2_TOKEN}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="confirm-warn">
        <WarningFilled style={{ color: "#F97316", fontSize: 16, flexShrink: 0 }} />
        <span className="confirm-warn-text">
          Crypto transactions are irreversible. Double-check the recipient
          address before confirming.
        </span>
      </div>

      <div className="confirm-actions">
        {!isParkingFlow && (
          <button
            type="button"
            className="confirm-cancel-btn"
            onClick={handleReject}
            disabled={isTransferLoading}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className={`confirm-primary-btn ${
            isParkingFlow ? "confirm-primary-btn-full" : ""
          }`}
          onClick={handleConfirm}
          disabled={isTransferLoading || !sendAmount || !senderAddress}
        >
          {isTransferLoading ? (
            <LoadingOutlined style={{ fontSize: 16 }} spin />
          ) : (
            <SendOutlined style={{ fontSize: 14 }} />
          )}
          <span>{isTransferLoading ? "Sending..." : "Confirm & Send"}</span>
        </button>
      </div>
    </div>
  );
}

export default ConfirmSendAssets;
