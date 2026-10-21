/** Toggle chips for "choose N from this list". Locked items show as taken. */
export function ChipPicker<T extends string>(props: {
  options: T[];
  selected: T[];
  max: number;
  label: (v: T) => string;
  onChange: (next: T[]) => void;
  locked?: T[];
}) {
  const full = props.selected.length >= props.max;
  return (
    <div className="chips" role="group">
      {props.options.map((opt) => {
        const on = props.selected.includes(opt);
        const locked = props.locked?.includes(opt) && !on;
        return (
          <button
            key={opt}
            type="button"
            className={`chip${on ? " on" : ""}`}
            aria-pressed={on}
            disabled={locked || (!on && full)}
            title={locked ? "Already proficient from another source" : undefined}
            onClick={() => props.onChange(on ? props.selected.filter((s) => s !== opt) : [...props.selected, opt])}
          >
            {props.label(opt)}
          </button>
        );
      })}
      <span className="count">
        {props.selected.length}/{props.max}
      </span>
    </div>
  );
}
