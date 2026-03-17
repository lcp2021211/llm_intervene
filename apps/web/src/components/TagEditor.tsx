interface TagEditorProps {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}

export function TagEditor({ label, values, placeholder, onChange }: TagEditorProps) {
  const remove = (value: string) => onChange(values.filter((item) => item !== value));

  return (
    <label className="field">
      <span>{label}</span>
      <div className="tag-editor">
        <div className="tag-list">
          {values.map((value) => (
            <button key={value} type="button" className="tag" onClick={() => remove(value)}>
              {value}
            </button>
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
