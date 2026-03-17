import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function TagEditor({ label, values, placeholder, onChange }) {
    const remove = (value) => onChange(values.filter((item) => item !== value));
    return (_jsxs("label", { className: "field", children: [_jsx("span", { children: label }), _jsxs("div", { className: "tag-editor", children: [_jsx("div", { className: "tag-list", children: values.map((value) => (_jsx("button", { type: "button", className: "tag", onClick: () => remove(value), children: value }, value))) }), _jsx("input", { placeholder: placeholder, onKeyDown: (event) => {
                            if (event.key !== "Enter") {
                                return;
                            }
                            event.preventDefault();
                            const next = event.currentTarget.value.trim();
                            if (!next || values.includes(next)) {
                                event.currentTarget.value = "";
                                return;
                            }
                            onChange([...values, next]);
                            event.currentTarget.value = "";
                        } })] })] }));
}
