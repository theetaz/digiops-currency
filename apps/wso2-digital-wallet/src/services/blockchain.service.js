// Copyright (c) 2023, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.
import { ethers } from 'ethers';
import { DateTime } from 'luxon';

import {
  CHAIN_ID,
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  RPC_ENDPOINT,
  STORAGE_KEYS,
} from '../constants/configs';
import { getTokenAsync } from '../helpers/auth';
import { getLocalDataAsync } from '../helpers/storage';

// Caps the per-log getBlock RPC fan-out for the history view.
export const MAX_TRANSFER_PAGE = 200;

// The JWT/Choreo gateway drops requests under large concurrent bursts.
const RPC_CONCURRENCY = 8;

let tokenDecimalsValue = null;
let tokenDecimalsInFlight = null;
const getTokenDecimals = async (contract) => {
  if (tokenDecimalsValue !== null) {
    return tokenDecimalsValue;
  }
  if (!tokenDecimalsInFlight) {
    tokenDecimalsInFlight = contract
      .decimals()
      .then((decimals) => {
        tokenDecimalsValue = decimals;
        return decimals;
      })
      .finally(() => {
        tokenDecimalsInFlight = null;
      });
  }
  return tokenDecimalsInFlight;
};

const mapWithConcurrency = async (items, mapper, concurrency) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  };
  const pool = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker
  );
  await Promise.all(pool);
  return results;
};

// Reuse one provider/token across a burst so concurrent queries don't each
// trigger a native token fetch. Short TTL keeps the baked-in JWT fresh.
const PROVIDER_TTL_MS = 30_000;
let cachedProvider = null;
let cachedProviderAt = 0;
let providerInFlight = null;

export const getRPCProvider = async () => {
  if (cachedProvider && Date.now() - cachedProviderAt < PROVIDER_TTL_MS) {
    return cachedProvider;
  }
  if (providerInFlight) {
    return providerInFlight;
  }
  providerInFlight = (async () => {
    try {
      const accessToken = await getTokenAsync();
      const headers = {
        Authorization: `Bearer ${accessToken}`
      };
      const provider = new ethers.providers.StaticJsonRpcProvider(
        { url: RPC_ENDPOINT, headers: headers },
        CHAIN_ID
      );
      cachedProvider = provider;
      cachedProviderAt = Date.now();
      return provider;
    } finally {
      providerInFlight = null;
    }
  })();
  return providerInFlight;
};

export const getCurrentBlockNumber = async (retryCount = 0) => {
  const maxRetryCount = 5; // Set max retry count to 5
  try {
    const provider = await getRPCProvider();
    const blockNumber = await provider.getBlockNumber();
    return blockNumber;
  } catch (error) {
    const statusMatch = error.message.match(/status=(\d+)/);
    const statusCode = statusMatch ? statusMatch[1] : null;

    if (retryCount < maxRetryCount) {
      return getCurrentBlockNumber(retryCount + 1);
    }
    if (statusMatch) {
      console.log("Status code:", statusCode);
    } else {
      console.error("Could not find status code in error message");
    }
    return null;
  }
};

export const getWalletBalanceByWalletAddress = async (walletAddress, { timeout = 15000 } = {}) => {
  const fetchBalance = async () => {
    try {
      const provider = await getRPCProvider();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        JSON.parse(CONTRACT_ABI),
        provider
      );
      const [balance, decimals] = await Promise.all([
        contract.balanceOf(walletAddress),
        getTokenDecimals(contract),
      ]);
      return ethers.utils.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Balance fetch error:', error);
      throw error;
    }
  };
  return Promise.race([
    fetchBalance(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Balance fetch timeout')), timeout))
  ]);
};

export const transferToken = async (senderWalletAddress, transferAmount) => {
  const provider = await getRPCProvider();
  const privateKey = await getLocalDataAsync(STORAGE_KEYS.PRIVATE_KEY);
  let wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    JSON.parse(CONTRACT_ABI),
    wallet
  );
  const options = { gasPrice: 0, gasLimit: 5000000 };
  const decimals = await contract.decimals();
  const amount = ethers.utils.parseUnits(transferAmount, decimals);
  const tx = await contract.transfer(senderWalletAddress, amount, options);
  const receipt = await tx.wait();
  return receipt;
};

export const getRecentTransactions = async (walletAddress) => {
  const provider = await getRPCProvider();
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    JSON.parse(CONTRACT_ABI),
    provider
  );
  const filter = {
    address: contract.address,
    topics: [ethers.utils.id("Transfer(address,address,uint256)")]
  };

  const currentBlockNumber = await getCurrentBlockNumber();
  const startBlockNumber = currentBlockNumber - 10000;
  filter.fromBlock = startBlockNumber;
  filter.toBlock = currentBlockNumber;
  const events = await provider.getLogs(filter);
  const transactions = [];

  for (const log of events) {
    const parsedLog = contract.interface.parseLog(log);
    if (
      parsedLog.args.to.toLowerCase() === walletAddress.toLowerCase() ||
      parsedLog.args.from.toLowerCase() === walletAddress.toLowerCase()
    ) {
      const block = await provider.getBlock(log.blockHash);

      transactions.push({
        direction:
          parsedLog.args.to.toLowerCase() === walletAddress.toLowerCase()
            ? "receive"
            : "send",
        tokenAmount: ethers.utils.formatUnits(parsedLog.args.value, 9),
        timestamp: DateTime.fromSeconds(block.timestamp).toFormat(
          "dd LLL yy HH:mm"
        )
      });
    }
  }
  return transactions?.reverse();
};

export const getTokenTransfersByAddress = async (
  walletAddress,
  fromBlock = 0,
  toBlock = 'latest',
  limit = 20,
  offset = 0
) => {
  const provider = await getRPCProvider();

  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    JSON.parse(CONTRACT_ABI),
    provider
  );

  const filterFrom = contract.filters.Transfer(walletAddress, null);
  const filterTo = contract.filters.Transfer(null, walletAddress);

  const [sentLogs, receivedLogs] = await Promise.all([
    contract.queryFilter(filterFrom, fromBlock, toBlock),
    contract.queryFilter(filterTo, fromBlock, toBlock),
  ]);

  const allLogs = [...sentLogs, ...receivedLogs]
    .sort((a, b) => b.blockNumber - a.blockNumber);

  const safeLimit = Math.min(Math.max(limit, 1), MAX_TRANSFER_PAGE);
  const safeOffset = Math.max(offset, 0);
  const paginatedLogs = allLogs.slice(safeOffset, safeOffset + safeLimit);

  const decimals = await getTokenDecimals(contract);

  const sentTxHashes = new Set(sentLogs.map((log) => log.transactionHash));

  // Cache the Promise so txs in the same block share one getBlock call.
  const blockCache = new Map();
  const getBlock = (blockNumber) => {
    if (!blockCache.has(blockNumber)) {
      blockCache.set(
        blockNumber,
        provider.getBlock(blockNumber).catch(() => null)
      );
    }
    return blockCache.get(blockNumber);
  };

  const formatLog = async (log) => {
    const block = await getBlock(log.blockNumber);
    const blockTimestampMs = block ? block.timestamp * 1000 : null;
    return {
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      from: log.args.from,
      to: log.args.to,
      value: ethers.utils.formatUnits(log.args.value, decimals),
      blockTimestamp: blockTimestampMs,
      timestamp: blockTimestampMs
        ? formatTimestamp(new Date(blockTimestampMs).toISOString())
        : 'Unknown time',
      direction: sentTxHashes.has(log.transactionHash) ? 'send' : 'receive'
    };
  };

  const transactions = await mapWithConcurrency(
    paginatedLogs,
    formatLog,
    RPC_CONCURRENCY
  );

  return {
    address: walletAddress,
    transactions,
    totalCount: allLogs.length,
    hasMore: safeOffset + safeLimit < allLogs.length,
    currentPage: Math.floor(safeOffset / safeLimit) + 1,
    totalPages: Math.ceil(allLogs.length / safeLimit)
  };
};

export const getTransactionHistory = async (walletAddress, fromBlock = 0, toBlock = 'latest', limit = 20, offset = 0) => {
  try {
    const result = await getTokenTransfersByAddress(walletAddress, fromBlock, toBlock, limit, offset);
    return result;
  } catch (error) {
    console.error('Error getting transaction history:', error);
    throw error;
  }
};

const formatTimestamp = (isoTimestamp) => {
  try {
    const dateTime = DateTime.fromISO(isoTimestamp, { zone: 'local' });
    return dateTime.toFormat("dd LLL yy HH:mm");
  } catch (error) {
    console.error('Error formatting timestamp:', error, 'Input:', isoTimestamp);
    return 'Unknown time';
  }
};
