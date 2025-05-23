// Copyright (c) 2023, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.

import './index.css';

import React from 'react';
import ReactDOM from 'react-dom';

import { ThemeSwitcherProvider } from 'react-css-theme-switcher';

import App from './App';
import reportWebVitals from './reportWebVitals';

const themes = {
  dark: `${process.env.PUBLIC_URL}/dark-theme.css`,
  light: `${process.env.PUBLIC_URL}/light-theme.css`
};

const init = async () => {
  // const storedTheme = await getLocalDataAsync(STORAGE_KEYS.THEME_MODE);
  // const themeState = storedTheme || "light";
  
  // Set light theme as default
  const themeState = "light";

  ReactDOM.render(
    <React.StrictMode>
      <ThemeSwitcherProvider themeMap={themes} defaultTheme={themeState}>
        <App />
      </ThemeSwitcherProvider>
    </React.StrictMode>,
    document.getElementById("root")
  );
};

init();

reportWebVitals();
