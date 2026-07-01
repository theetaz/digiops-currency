// Copyright (c) 2023, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.

import { Layout } from "antd";
import React, { useEffect, useState } from "react";
import FooterBar from "./components/Footer/Footer";
import TopBar from "./components/TopBar/TopBar";
import Pages from "./pages/Pages";
// import "./dark-theme.css";
// import "./light-theme.css";
import { useLocation, useNavigate } from "react-router-dom";
import {
  hydrateLaunchDataFromBridge,
  peekPaymentLaunchData,
} from "./helpers/paymentFlow";
import { waitForBridge } from "./helpers/bridge";
import { requestDeviceSafeAreaInsets } from "./microapp-bridge";

const MIN_BOTTOM_PADDING_PX = 8;

function LayoutView() {
  const { Content } = Layout;
  const location = useLocation();
  const navigate = useNavigate();

  const [isShowFooter, setIsShowFooter] = useState(false);

  useEffect(() => {
    if (
      location.pathname === "/create-wallet" ||
      location.pathname === "/wallet-phrase" ||
      location.pathname === "/recover-wallet"
    ) {
      setIsShowFooter(false);
    } else {
      setIsShowFooter(true);
    }
  }, [location]);

  useEffect(() => {
    if (location.pathname !== "/") {
      return;
    }
    let cancelled = false;
    (async () => {
      // 1. Peek payment launch data (instant check if already in URL / window)
      let peekPayment = peekPaymentLaunchData();

      // 2. If not present, run the bridge hydration once
      if (!peekPayment) {
        await hydrateLaunchDataFromBridge();
        if (cancelled) return;
        peekPayment = peekPaymentLaunchData();
      }

      if (peekPayment) {
        navigate("/send", { replace: true });
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ready = await waitForBridge();
      if (!ready || cancelled) return;
      requestDeviceSafeAreaInsets((data) => {
        if (cancelled) return;
        const top = data?.insets?.top;
        const bottom = data?.insets?.bottom;

        if (typeof top === "number") {
          document.documentElement.style.setProperty(
            "--safe-area-top",
            `${Math.max(0, top)}px`,
          );
        }
        if (typeof bottom === "number") {
          const value = Math.max(MIN_BOTTOM_PADDING_PX, bottom);
          document.documentElement.style.setProperty(
            "--safe-area-bottom",
            `${value}px`,
          );
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="main-background">
      <div className="col-lg-3 col-md-3 col-sm-12">
        <TopBar />
        <Layout className="main-layout">
          <Layout className="site-layout">
            <Content className={`layout-content ${isShowFooter ? 'has-footer' : 'no-footer'}`}>
              <div className="mt-3 mx-auto">
                <div>
                  <Pages />
                </div>
              </div>
            </Content>
          </Layout>
        </Layout>
        {isShowFooter ? (
          <div className="footer-wrapper">
            <FooterBar className="footer-bar" />
          </div>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
}

export default LayoutView;
