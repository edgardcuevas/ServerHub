import { useState } from "react";
import Button from "./Button";
import Field from "./Field";

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  loading = false,
  loadingLabel = "Eliminando...",
  requirePassword = false,
  passwordError = "",
  onCancel,
  onConfirm
}) {
  const [password, setPassword] = useState("");

  function handleConfirm() {
    onConfirm(requirePassword ? password : undefined);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">{title}</h3>
        <p className="modal__sub">{message}</p>

        {requirePassword && (
          <Field
            label="Clave administrativa"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
          />
        )}

        <div className="modal__actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
                    <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            disabled={loading || (requirePassword && !password)}
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;