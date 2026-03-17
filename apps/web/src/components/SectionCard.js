import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SectionCard({ eyebrow, title, actions, children }) {
    return (_jsxs("section", { className: "section-card", children: [_jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: eyebrow }), _jsx("h2", { children: title })] }), actions] }), children] }));
}
