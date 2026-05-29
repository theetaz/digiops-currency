// Copyright (c) 2023, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.

import './Home.css';

import {
  useEffect,
  useState,
  useRef,
} from 'react';

import { message } from 'antd';
import { NumericFormat } from 'react-number-format';
import { useNavigate } from 'react-router-dom';

import { SendOutlined, DownloadOutlined } from '@ant-design/icons';

import RecentActivities from '../../components/Home/RecentActivities';
import {
  DEFAULT_WALLET_ADDRESS,
  STORAGE_KEYS,
} from '../../constants/configs';
import {
  ERROR,
  ERROR_RETRIEVE_WALLET_ADDRESS,
  ERROR_BRIDGE_NOT_READY,
  SEND,
  REQUEST,
  TOTAL_BALANCE,
  WSO2_TOKEN,
  WSO2_WALLET,
  CONNECTED,
  CONNECTING,
  OK,
} from '../../constants/strings';
import { showAlertBox } from '../../helpers/alerts';
import { getLocalDataAsync } from '../../helpers/storage';
import { waitForBridge } from '../../helpers/bridge';
import { useWalletBalance } from '../../services/query-hooks';

function Home() {
  const navigate = useNavigate();
  const [walletAddress, setWalletAddress] = useState(DEFAULT_WALLET_ADDRESS);
  const recentActivitiesRef = useRef();

  const [messageApi, contextHolder] = message.useMessage();

  const fetchWalletAddress = async () => {
    try {
      const isBridgeReady = await waitForBridge();
      if (!isBridgeReady) {
        console.error(ERROR_BRIDGE_NOT_READY);
        showAlertBox(ERROR, ERROR_BRIDGE_NOT_READY, OK);
        return;
      }

      const walletAddressResponse = await getLocalDataAsync(
        STORAGE_KEYS.WALLET_ADDRESS
      );
      if (walletAddressResponse !== walletAddress) {
        setWalletAddress(walletAddressResponse);
      }
    } catch (error) {
      console.log(`${ERROR_RETRIEVE_WALLET_ADDRESS} - ${error}`);
      messageApi.error(ERROR_RETRIEVE_WALLET_ADDRESS);
    }
  };

  const { data: tokenBalance, isLoading: isTokenBalanceLoading, refetch } = useWalletBalance(walletAddress);
  const hasValidAddress =
    typeof walletAddress === 'string' &&
    walletAddress.startsWith('0x') &&
    walletAddress.length === 42;

  useEffect(() => {
    fetchWalletAddress();
  }, []);

  useEffect(() => {
    if (walletAddress &&
        walletAddress !== DEFAULT_WALLET_ADDRESS &&
        walletAddress !== "0x" &&
        walletAddress.length === 42) {
      refetch();
    }
  }, [walletAddress, refetch]);

  const handleSend = () => {
    navigate("/send");
  };

  const handleReceive = () => {
    navigate("/receive");
  };

  useEffect(() => {
    if (!walletAddress || walletAddress?.length === 0) {
      navigate("/create-wallet");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  return (
    <div className="home-container">
      {contextHolder}

      <div className="wallet-hero">
        <div className="wallet-hero-label">Connected Wallet</div>
        <div className="wallet-hero-name">{WSO2_WALLET}</div>
        <div className="wallet-hero-badge-row">
          <span className={`hero-badge ${hasValidAddress ? 'is-connected' : 'is-connecting'}`}>
            <span className="hero-badge-dot" />
            <span className="hero-badge-text">
              {hasValidAddress ? CONNECTED : CONNECTING}
            </span>
          </span>
        </div>
        <div className="hero-balance-label">{TOTAL_BALANCE}</div>
        <div className="hero-balance-row">
          <div className="hero-balance-amount">
            {isTokenBalanceLoading ? (
              <div
                className="hero-balance-skeleton"
                role="status"
                aria-label="Loading balance"
              />
            ) : typeof tokenBalance === 'undefined' ? (
              <button className="hero-balance-retry" onClick={refetch}>
                Retry
              </button>
            ) : (
              <NumericFormat
                value={tokenBalance}
                displayType={"text"}
                thousandSeparator={true}
                decimalScale={6}
                fixedDecimalScale={false}
              />
            )}
          </div>
          {!isTokenBalanceLoading && (
            <div className="hero-balance-ticker">{WSO2_TOKEN}</div>
          )}
        </div>
      </div>

      <div className="home-action-row">
        <button
          className="home-action-btn home-action-btn-primary"
          onClick={handleSend}
        >
          <SendOutlined style={{ fontSize: 16 }} />
          <span>{SEND}</span>
        </button>
        <button
          className="home-action-btn home-action-btn-secondary"
          onClick={handleReceive}
        >
          <DownloadOutlined style={{ fontSize: 16 }} />
          <span>{REQUEST}</span>
        </button>
      </div>

      <RecentActivities
        ref={recentActivitiesRef}
        walletAddress={walletAddress}
        onPullRefresh={refetch}
      />
    </div>
  );
}

export default Home;
