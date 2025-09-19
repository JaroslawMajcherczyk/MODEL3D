// src/components/actions/index.js
// Ten plik eksportuje WYŁĄCZNIE etapy fokusów oraz focusStage.
// NIE importuje nic z ../actions.jsx, żeby nie było cyklu.

export { focusModelFirstStageSmooth }  from "./focusFirst";
export { focusModelSecondStageSmooth } from "./focusSecond";
export { focusModelThirdStageSmooth }  from "./focusThird";
export { focusModelFourthStageSmooth } from "./focusFourth";

// Jednolity przełącznik etapów (z lazy importem można zrobić osobno)
export async function focusStage(n, opts = {}) {
  if (n === 1) {
    const { focusModelFirstStageSmooth } = await import("./focusFirst");
    return focusModelFirstStageSmooth(opts);
  }
  if (n === 2) {
    const { focusModelSecondStageSmooth } = await import("./focusSecond");
    return focusModelSecondStageSmooth(opts);
  }
  if (n === 3) {
    const { focusModelThirdStageSmooth } = await import("./focusThird");
    return focusModelThirdStageSmooth(opts);
  }
  if (n === 4) {
    const { focusModelFourthStageSmooth } = await import("./focusFourth");
    return focusModelFourthStageSmooth(opts);
  }
  console.warn("[focusStage] unsupported stage:", n);
}

// Opcjonalna rejestracja do window.Nexus.actions (tylko etapy)
if (typeof window !== "undefined") {
  window.Nexus ??= {};
  window.Nexus.actions ??= {};
  const api = {
    focusStage,
    // te cztery mogą być dociągane od razu (jeśli nie chcesz lazy – usuń awaity powyżej)
    // ale żeby nie wymuszać importu całych modułów już teraz, rejestrujemy „proxy”:
    focusModelFirstStageSmooth:  (...a) => import("./focusFirst").then(m  => m.focusModelFirstStageSmooth(...a)),
    focusModelSecondStageSmooth: (...a) => import("./focusSecond").then(m => m.focusModelSecondStageSmooth(...a)),
    focusModelThirdStageSmooth:  (...a) => import("./focusThird").then(m  => m.focusModelThirdStageSmooth(...a)),
    focusModelFourthStageSmooth: (...a) => import("./focusFourth").then(m => m.focusModelFourthStageSmooth(...a)),
  };
  Object.assign(window.Nexus.actions, api);
  window.dispatchEvent(new Event("nexus:actions:ready"));
  window.Nexus?.send?.("ActionsReady");
  console.log("[Nexus] actions registered (stages only):", Object.keys(api));
}
