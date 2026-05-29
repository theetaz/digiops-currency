// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.

import React from 'react';

const TransactionItemSkeleton = () => (
  <div className="transaction-item-skeleton" aria-hidden="true">
    <div className="skeleton-block skeleton-icon" />
    <div className="skeleton-main">
      <div className="skeleton-block skeleton-line skeleton-line-title" />
      <div className="skeleton-block skeleton-line skeleton-line-sub" />
    </div>
    <div className="skeleton-block skeleton-amount" />
  </div>
);

export const TransactionListSkeleton = ({ count = 5 }) => (
  <div className="transaction-list-skeleton" role="status" aria-label="Loading transactions">
    {Array.from({ length: count }).map((_, i) => (
      <TransactionItemSkeleton key={i} />
    ))}
  </div>
);

export default TransactionItemSkeleton;
