import { useState } from "react";
import Button from "./Button";
import Field from "./Field";

function NewFileDialog({ onCancel, onConfirm, loading = false }) {

  const [nombre, setNombre] = useState("");
  const [contenido, setContenido] = useState("");

  function handleConfirm() {
    onConfirm(nombre, contenido);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Nuevo archivo</h3>
        <p className="modal__sub">
          Podés dejar el contenido vacío si querés crearlo en blanco.
        </p>

        <Field
          label="Nombre del archivo"
          type="text"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />

        <label className="sh-field">
          <span className="sh-field__label">Contenido (opcional)</span>
          <textarea
            className="sh-field__input sh-field__textarea"
            rows={8}
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
            disabled={loading || !nombre.trim()}
          >
            {loading ? "Creando..." : "Crear"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NewFileDialog;