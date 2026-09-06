import { useState } from "react";
import Button from "./Button";

function EditFileDialog({ fileName, initialContent, onCancel, onConfirm, loading = false }) {

  const [contenido, setContenido] = useState(initialContent);

  function handleConfirm() {
    onConfirm(contenido);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Editar {fileName}</h3>
        <p className="modal__sub">
          Los archivos que no sean de texto plano pueden dañarse al editarlos así.
        </p>

        <label className="sh-field">
          <span className="sh-field__label">Contenido</span>
          <textarea
            className="sh-field__input sh-field__textarea sh-field__textarea--lg"
            rows={16}
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
          />
        </label>

        <div className="modal__actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EditFileDialog;