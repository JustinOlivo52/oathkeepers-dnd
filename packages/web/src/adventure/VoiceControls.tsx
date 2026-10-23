import { useEffect, useReducer } from "react";
import { availableVoices, narrator, speechSupported } from "./narrator";

/** Turn the DM's voice on or off, and pick the voice and speed. */
export function VoiceControls() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => narrator.subscribe(rerender), []);
  if (!speechSupported) return null;
  const { on, voice, rate } = narrator.settings;
  const voices = availableVoices();
  return (
    <div className="voice-controls">
      <button className={on ? "on" : ""} aria-pressed={on} onClick={() => narrator.update({ on: !on })} title="Read the DM's narration aloud">
        {on ? "Voice on" : "Voice off"}
      </button>
      {on && (
        <details className="voice-settings">
          <summary>Voice settings</summary>
          <label>
            Voice
            <select value={voice || voices[0]?.voiceURI || ""} onChange={(e) => narrator.update({ voice: e.target.value })}>
              {!voices.length && <option value="">Browser default</option>}
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
          <label>
            Speed {rate.toFixed(1)}x
            <input type="range" min={0.7} max={1.5} step={0.1} value={rate} onChange={(e) => narrator.update({ rate: Number(e.target.value) })} />
          </label>
          <button className="ghost small" onClick={() => narrator.sample()}>
            Test voice
          </button>
          <p className="muted small">Uses your browser's voices. Edge has the best ones on Windows.</p>
        </details>
      )}
    </div>
  );
}
