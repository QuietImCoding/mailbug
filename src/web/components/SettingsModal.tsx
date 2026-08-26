import { useEffect, useState } from "react";
import { fetchConfig, saveConfig } from "../lib/api.ts";
import type { MailConfig } from "../lib/api.ts";

type Category = MailConfig["categories"][number];

export function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [priorities, setPriorities] = useState<number[]>([]);
  const [instructions, setInstructions] = useState("");
  const [responseShape, setResponseShape] = useState("");
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

  const updateCategory = (index: number, next: Category) =>
    setCategories((prev) => prev.map((c, i) => (i === index ? next : c)));

  const addCategory = () =>
    setCategories((prev) => [
      ...prev,
      { key: "", prompt: "", priority: priorities[0] ?? 1 },
    ]);

  const removeCategory = (index: number) =>
    setCategories((prev) => prev.filter((_, i) => i !== index));

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
          <div className="category-editor">
            {categories.map((category, i) => (
              <div className="category-row" key={i}>
                <input
                  className="field cat-key"
                  value={category.key}
                  placeholder="key"
                  aria-label={`category ${i + 1} key`}
                  onChange={(event) =>
                    updateCategory(i, { ...category, key: event.target.value })
                  }
                />
                <input
                  className="field cat-priority"
                  type="number"
                  value={category.priority}
                  aria-label={`category ${i + 1} priority`}
                  onChange={(event) =>
                    updateCategory(i, {
                      ...category,
                      priority: Number(event.target.value),
                    })
                  }
                />
                <textarea
                  className="field cat-prompt"
                  rows={2}
                  value={category.prompt}
                  placeholder="how to decide — shown to the LLM"
                  aria-label={`category ${i + 1} prompt`}
                  onChange={(event) =>
                    updateCategory(i, { ...category, prompt: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="cat-remove"
                  aria-label={`Remove ${category.key || i + 1}`}
                  onClick={() => removeCategory(i)}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="cat-add" onClick={addCategory}>
              + add category
            </button>
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
