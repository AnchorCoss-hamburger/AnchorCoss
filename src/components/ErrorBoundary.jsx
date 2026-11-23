// 화면 에러 경계: 그리는 도중 예외가 나도 화면이 통째로 하얗게 되지 않고 안내와 복구 버튼을 보여 준다.
// - 다시 시도: 같은 화면을 새로 그린다 (시뮬레이션은 처음 상태로 시작 — 일시정지)
// - 대시보드로: 하위 페이지(#/station, #/route, #/compare)의 오류가 반복될 때 메인으로 돌아가 다시 그린다
// - 새로고침: 페이지 전체를 다시 불러온다
// ※ 이벤트 핸들러·비동기(fetch) 오류는 React가 잡지 않는다 (그런 오류는 화면을 비우지 않고 각 훅이 처리한다).

import { Component } from "react";

const MAX_DETAIL = 300;

/** 오류 → 화면에 보일 짧은 문장 */
export function errorDetail(error) {
  const msg = String(error?.message ?? error ?? "알 수 없는 오류");
  return msg.length > MAX_DETAIL ? `${msg.slice(0, MAX_DETAIL)}…` : msg;
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
    this.goHome = this.goHome.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error: error ?? new Error("알 수 없는 오류") };
  }

  componentDidCatch(error, info) {
    // 콘솔에 남겨 두면 원인을 나중에 확인할 수 있다 (F12)
    console.error("[화면 오류]", error, info?.componentStack ?? "");
  }

  retry() {
    this.setState({ error: null });
  }

  goHome() {
    window.location.hash = "#/";
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fatal" role="alert">
        <div className="card fatal-card">
          <h1>화면에 문제가 생겼습니다</h1>
          <p className="sub">
            일시적인 오류일 수 있습니다. <b>다시 시도</b>를 누르면 화면을 새로 불러오고, 같은 오류가 반복되면{" "}
            <b>대시보드로</b> 돌아가거나 <b>새로고침</b>(F5)하세요.
          </p>
          <pre className="fatal-detail">{errorDetail(error)}</pre>
          <div className="fatal-actions">
            <button className="btn is-primary" onClick={this.retry}>
              다시 시도
            </button>
            <button className="btn" onClick={this.goHome}>
              대시보드로
            </button>
            <button className="btn" onClick={() => window.location.reload()}>
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}
