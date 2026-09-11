"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  notify: (message: string) => void;
};

type State = {
  failed: boolean;
};

export default class GeoVisualCalibrationGuard extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Geo visual calibration isolated failure", error, info.componentStack);
    const message =
      error instanceof Error && error.message
        ? `Satellite panel safely isolated: ${error.message}`
        : "Satellite panel safely isolated after a runtime error";
    this.props.notify(message);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          role="alert"
          style={{
            margin: "12px 0 14px",
            border: "1px solid #7b5c21",
            borderRadius: 10,
            background: "#3a2a12",
            color: "#ffd778",
            padding: "12px 14px",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Google Satellite panel runtime error se safely isolate ho gaya. Geo Mapper ke
          manual control-point fields aur baaki project workflow available rahenge. Page
          reload karke Satellite ko dobara explicitly load karein.
        </div>
      );
    }

    return this.props.children;
  }
}
