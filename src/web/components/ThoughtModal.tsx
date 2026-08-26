import { useEffect, useState } from "react";
import { fetchEmail, type EmailDetail, type EmailListItem } from "../lib/api.ts";
import { actionLabel } from "../lib/format.ts";

interface LlmMeta {
  model: string;
  raw: string;
  reasoning?: string;
}

function parseLlm(json: string): LlmMeta | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as LlmMeta;
  } catch {
    return null;
  }
}

export function ThoughtModal({
  email,
  onClose,
}: {
  email: EmailListItem;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEmail(email.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setError("couldn't load the LLM thought");
      });
    return () => {
      cancelled = true;
    };
  }, [email.id]);

  // Classification keys live on both the list item and the detail; prefer the
  // detail (it is fetched fresh) but fall back to the list item.
  const cls = detail ?? email;
  const llm = parseLlm(detail?.llm_json ?? "");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal thought"
        role="dialog"
        aria-modal="true"
        aria-label="LLM thought"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <span>LLM thought</span>
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
          {error ? (
            <p className="muted">{error}</p>
          ) : (
            <>
              <div className="thought-classification">
                <div>
                  <span className="k">category</span>
                  <span className="v">{cls.category}</span>
                </div>
                <div>
                  <span className="k">priority</span>
                  <span className="v">{cls.priority}</span>
                </div>
                <div>
                  <span className="k">topic</span>
                  <span className="v">{cls.topic}</span>
                </div>
                <div>
                  <span className="k">actions</span>
                  <span className="v">
                    {cls.actions.map((a) => actionLabel(a.action_type)).join(", ") || "none"}
                  </span>
                </div>
              </div>

              <h3 className="thought-head">reasoning</h3>
              {llm?.reasoning ? (
                <pre className="thought-pre">{llm.reasoning}</pre>
              ) : (
                <p className="muted">no reasoning captured</p>
              )}

              <h3 className="thought-head">raw output</h3>
              {llm?.raw ? (
                <pre className="thought-pre">{llm.raw}</pre>
              ) : (
                <p className="muted">none</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
