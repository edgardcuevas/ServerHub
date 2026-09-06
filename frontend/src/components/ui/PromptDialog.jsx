import { useState } from "react";
import Button from "./Button";
import Field from "./Field";

function PromptDialog({
  title,
  message,
  label,
  initialValue = "",
  confirmLabel = "Confirmar",
  loading = false,
  loadingLabel = "Guardando...",
  error = "",
  onCancel,
  onConfirm
}) {

  const [value, setValue] = useState(initialValue);

  function handleConfirm() {
    onConfirm(value);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">{title}</h3>
        {message && <p className="modal__sub">{message}</p>}

        <Field
          label={label}
          type="text"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error}
        />

        <div className="modal__actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            disabled={loading || !value.trim()}
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PromptDialog;