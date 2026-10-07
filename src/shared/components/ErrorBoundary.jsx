import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error('Dolphin render error:', error, info); }
  render() {
    if (this.state.failed) return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"><h1 className="text-xl font-semibold">Không thể hiển thị màn hình này</h1><p>Dữ liệu có thể chưa tải đầy đủ. Hãy tải lại để thử tiếp.</p><button className="rounded-xl bg-blue-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>Tải lại trang</button></div>;
    return this.props.children;
  }
}
