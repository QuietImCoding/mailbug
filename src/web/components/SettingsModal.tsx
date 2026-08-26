import { useEffect, useState } from "react";
import { fetchConfig, saveConfig } from "../lib/api.ts";

export function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [categories, setCategories] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<number[]>([]);
  const [instructions, setInstructions] = useState("");
  const [responseShape, setResponseShape] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConfig()
      .then((cfg) => {
        if (cancelled) return;
        setCategories(cfg.categories);
        setPriorities(cfg.priorities);
        setInstructions(cfg.prompt.instructions);
        setResponseShape(cfg.prompt.responseShape);
      })
      .catch(() => {
        if (!cancelled) setError("couldn't load config");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addCategory = () => {
    const value = newCategory.trim().toLowerCase();
    if (!value) return;
    if (!categories.includes(value)) setCategories((prev) => [...prev, value]);
    setNewCategory("");
  };

  const removeCategory = (category: string) =>
    setCategories((prev) => prev.filter((c) => c !== category));

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig({ categories, priorities, prompt: { instructions, responseShape } });
      onSaved("classification config saved");
      onClose();
    } catch {
      setError("couldn't save config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal settings"
        role="dialog"
        aria-modal="true"
        aria-label="Classification settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <span>Classification settings</span>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {error ? <p className="muted">{error}</p> : null}

          <label className="field-label" htmlFor="prompt-instructions">
            LLM prompt instructions
          </label>
          <textarea
            id="prompt-instructions"
            className="field"
            rows={5}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />

          <label className="field-label" htmlFor="prompt-shape">
            Response shape
          </label>
          <textarea
            id="prompt-shape"
            className="field"
            rows={2}
            value={responseShape}
            onChange={(event) => setResponseShape(event.target.value)}
          />

          <label className="field-label">Priorities (comma-separated)</label>
          <input
            className="field"
            value={priorities.join(", ")}
            onChange={(event) =>
              setPriorities(
                event.target.value
                  .split(",")
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n)),
              )
            }
          />

          <label className="field-label">Categories</label>
          <div className="category-list">
            {categories.map((category) => (
              <span className="category-chip" key={category}>
                {category}
                <button
                  type="button"
                  aria-label={`Remove ${category}`}
                  onClick={() => removeCategory(category)}
                >
                  ×
                </button>
              </span>
            ))}
            <span className="category-add">
              <input
                value={newCategory}
                placeholder="add category"
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addCategory();
                }}
              />
              <button type="button" onClick={addCategory}>
                add
              </button>
            </span>
          </div>

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              cancel
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "saving…" : "save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
