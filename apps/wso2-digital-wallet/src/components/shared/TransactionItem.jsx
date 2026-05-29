// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.

import React, { useMemo, useState } from 'react';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { DateTime } from 'luxon';

import { WSO2_TOKEN } from '../../constants/strings';
import {
  formatWalletAddress,
  copyTextToClipboard,
} from '../../utils/transactionUtils';

const formatBalance = (raw) => {
  if (raw == null) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

const DetailRow = ({ label, value, copyValue, copyLabel, muted }) => {
  const handleCopy = (e) => {
    e.stopPropagation();
    if (copyValue) copyTextToClipboard(copyValue, copyLabel || label);
  };
  return (
    <div className="transaction-detail-row">
      <span className="transaction-detail-label">{label}</span>
      <span
        className={`transaction-detail-value ${muted ? 'is-muted' : ''}`}
      >
        {value}
        {copyValue && (
          <button
            type="button"
            className="transaction-detail-copy"
            onClick={handleCopy}
            aria-label={`Copy ${copyLabel || label}`}
          >
            <CopyOutlined />
          </button>
        )}
      </span>
    </div>
  );
};

const TransactionItem = ({ transaction, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isSend = transaction.direction === 'send';
  const counterparty = isSend ? transaction.to : transaction.from;

  const fullDateTime = useMemo(() => {
    if (Number.isFinite(transaction.blockTimestamp)) {
      return DateTime.fromMillis(transaction.blockTimestamp).toFormat(
        'd LLL yyyy · HH:mm',
      );
    }
    return transaction.timestamp || '—';
  }, [transaction.blockTimestamp, transaction.timestamp]);

  const toggle = () => setIsExpanded((v) => !v);

  const balanceDisplay = formatBalance(transaction.runningBalance);

  return (
    <div
      key={index}
      className={`transaction-item ${isExpanded ? 'is-expanded' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="transaction-item-summary">
        <div className={`tx-icon ${isSend ? 'sent' : 'received'}`}>
          {isSend ? (
            <ArrowUpOutlined style={{ fontSize: 18 }} />
          ) : (
            <ArrowDownOutlined style={{ fontSize: 18 }} />
          )}
        </div>

        <div className="transaction-item-main">
          <span className="transaction-item-title">
            {isSend ? 'Sent' : 'Received'}
          </span>
          <span className="transaction-item-counterparty">
            {isSend ? 'to ' : 'from '}
            {formatWalletAddress(counterparty)}
          </span>
        </div>

        <div className="transaction-item-side">
          <span
            className={`transaction-item-amount ${
              isSend ? 'red-text' : 'green-text'
            }`}
          >
            {isSend ? '-' : '+'}
            {transaction.value}
            <span className="transaction-item-ticker">{WSO2_TOKEN}</span>
          </span>
        </div>

        <DownOutlined
          className={`transaction-item-chevron ${
            isExpanded ? 'is-open' : ''
          }`}
        />
      </div>

      <div
        className="transaction-item-details"
        aria-hidden={!isExpanded}
      >
        <div className="transaction-item-divider" />
        <DetailRow
          label="Running balance"
          value={
            balanceDisplay ? (
              <>
                {balanceDisplay}
                <span className="transaction-detail-ticker">{WSO2_TOKEN}</span>
              </>
            ) : (
              '—'
            )
          }
          muted={!balanceDisplay}
        />
        <DetailRow
          label={isSend ? 'Sent to' : 'Received from'}
          value={formatWalletAddress(counterparty)}
          copyValue={counterparty}
          copyLabel={isSend ? "Recipient's address" : "Sender's address"}
        />
        <DetailRow label="When" value={fullDateTime} />
      </div>
    </div>
  );
};

export default TransactionItem;
