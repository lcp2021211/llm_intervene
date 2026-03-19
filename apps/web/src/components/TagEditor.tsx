interface TagEditorProps {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}

export function TagEditor({ label, values, placeholder, onChange }: TagEditorProps) {
  const remove = (index: number) => onChange(values.filter((_item, itemIndex) => itemIndex !== index));

  return (
    <label className="field">
      <span>{label}</span>
      <div className="tag-editor">
        <div className="tag-list">
          {values.map((value, index) => (
            <span key={`${value}-${index}`} className="tag">
              <span>{value}</span>
              <button
                type="button"
                className="tag-remove"
                aria-label={`删除 ${value}`}
                onClick={() => remove(index)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          placeholder={placeholder}
          onKeyDown={(event) => {
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
          }}
        />
      </div>
    </label>
  );
}
