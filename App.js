import React, { useState } from "react";

import OnboardScreen from "./src/screens/OnboardScreen";
import WalletScreen from "./src/screens/WalletScreen";
import MainAppScreen from "./src/screens/MainAppScreen";

const SCREENS = { onboard: "onboard", wallet: "wallet", app: "app" };

export default function App() {
  const [screen, setScreen] = useState(SCREENS.onboard);

  if (screen === SCREENS.onboard) {
    return <OnboardScreen onNext={() => setScreen(SCREENS.wallet)} />;
  }

  if (screen === SCREENS.wallet) {
    return <WalletScreen onConnect={() => setScreen(SCREENS.app)} />;
  }

  return <MainAppScreen />;
}
