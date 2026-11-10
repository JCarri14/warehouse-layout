import { t, useLanguage } from '../i18n'
import { Icon } from './Icon'
import { formatMeasure as metres, lengthText, getMeasurementUnit } from '../measurements'
type Props = {
  tool: 'select' | 'pan'; onTool: (tool: 'select' | 'pan') => void;
  snap: number; gridSizeMm: number; onSnap: (step: number) => void; selected: boolean; disabled: boolean;
  onDuplicate: () => void; onRotate: () => void; onDelete: () => void;
  undoLabel?: string; redoLabel?: string; onUndo: () => void; onRedo: () => void;
}
export function EditToolbar(p: Props) {
  useLanguage()
  return <nav className="edit-toolbar" aria-label={t("Edición del plano")}>
    <div className="tool-modes"><button aria-label={t("Seleccionar y mover")} title={t("Seleccionar y mover estanterías")} aria-pressed={p.tool === 'select'} onClick={() => p.onTool('select')}><Icon name="select" size={16}/><span>{t("Seleccionar y mover")}</span></button><button aria-label={t("Mover vista")} title={t("Mover vista (también Espacio al arrastrar)")} aria-pressed={p.tool === 'pan'} onClick={() => p.onTool('pan')}><Icon name="hand" size={16}/><span>{t("Mover vista")}</span></button></div>
    <label className="snap-control"><span>{t("Ajuste")}</span><select aria-label={t("Paso de cuadrícula")} value={p.snap} disabled={p.disabled} onChange={e => p.onSnap(Number(e.target.value))}><option value="-1">{metres(p.gridSizeMm)} {getMeasurementUnit()} · {t("Cuadrícula")}</option><option value="0">{t("Sin ajuste")}</option><option value="100">{lengthText(100)}</option><option value="500">{lengthText(500)}</option><option value="1000">{lengthText(1000)}</option></select></label>
    <div className="selection-actions"><button disabled={!p.selected || p.disabled} onClick={p.onDuplicate} title={t("Duplicar (Ctrl+D)")}><Icon name="duplicate" size={15}/>{t("Duplicar")}</button><button disabled={!p.selected || p.disabled} onClick={p.onRotate} title={t("Girar desde la esquina de posición (R con el plano enfocado)")}><Icon name="rotate" size={15}/>{t("Girar 90°")}</button><button className="delete-action" disabled={!p.selected || p.disabled} onClick={p.onDelete} title={t("Eliminar (Supr); se puede deshacer")}><Icon name="trash" size={15}/>{t("Eliminar")}</button></div>
    <div className="history-actions"><button aria-label={t("Deshacer")} title={p.undoLabel ? `${t("Deshacer")}: ${t(p.undoLabel)} (Ctrl+Z)` : t('Deshacer (Ctrl+Z)')} disabled={!p.undoLabel || p.disabled} onClick={p.onUndo}><Icon name="undo" size={16}/></button><button aria-label={t("Rehacer")} title={p.redoLabel ? `${t("Rehacer")}: ${t(p.redoLabel)} (Ctrl+Shift+Z)` : t('Rehacer (Ctrl+Mayús+Z)')} disabled={!p.redoLabel || p.disabled} onClick={p.onRedo}><Icon name="redo" size={16}/></button></div>
  </nav>
}
