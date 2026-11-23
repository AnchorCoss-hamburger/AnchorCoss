// 지도 휠 줌 보호: 페이지를 마우스 휠로 내리다가 지도 위에서 지도만 확대·축소되는 것을 막는다.
// - 기본은 휠 줌 꺼짐 (휠은 페이지 스크롤로 간다). +/- 버튼과 더블클릭 확대는 그대로 동작한다.
// - 지도를 한 번 클릭하면 휠 줌이 켜지고, 마우스가 지도를 벗어나면 다시 꺼진다.
//   (마커를 누르는 클릭은 지도 클릭으로 전달되지 않으므로 휠 줌이 켜지지 않는다)

/** @param {{ scrollWheelZoom: { enable(): void, disable(): void }, on(ev: string, fn: () => void): any }} map Leaflet 지도 */
export function guardWheelZoom(map) {
  map.scrollWheelZoom.disable();
  map.on("click", () => map.scrollWheelZoom.enable());
  map.on("mouseout", () => map.scrollWheelZoom.disable());
}
