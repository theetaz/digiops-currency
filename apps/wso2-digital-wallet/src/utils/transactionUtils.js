// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.

import { message } from 'antd';
import { DateTime } from 'luxon';

export const formatWalletAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
};

export const copyToClipboard = async (address, direction) => {
  try {
    await navigator.clipboard.writeText(address);
    const action = direction === 'send' ? 'Recipient\'s' : 'Sender\'s';
    message.success(`${action} wallet address copied to clipboard!`);
  } catch (err) {
    // for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = address;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    const action = direction === 'send' ? 'Recipient\'s' : 'Sender\'s';
    message.success(`${action} wallet address copied to clipboard!`);
  }
};

export const formatTimestamp = (timestamp) => {
  return new Date(timestamp).toLocaleString();
};

const getDateLabel = (dateTime, today) => {
  const startOfDay = dateTime.startOf('day');
  const diffDays = Math.round(today.diff(startOfDay, 'days').days);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (startOfDay.year === today.year) {
    return startOfDay.toFormat('d LLLL');
  }
  return startOfDay.toFormat('d LLLL yyyy');
};

export const groupTransactionsByDate = (transactions) => {
  if (!transactions || transactions.length === 0) return [];
  const today = DateTime.local().startOf('day');
  const groups = [];
  const indexByKey = new Map();

  transactions.forEach((tx) => {
    const ts = tx.blockTimestamp;
    let key = 'unknown';
    let label = 'Unknown date';
    if (typeof ts === 'number' && Number.isFinite(ts)) {
      const dt = DateTime.fromMillis(ts).startOf('day');
      key = dt.toISODate();
      label = getDateLabel(dt, today);
    }
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({ key, label, transactions: [] });
    }
    groups[indexByKey.get(key)].transactions.push(tx);
  });

  return groups;
};
