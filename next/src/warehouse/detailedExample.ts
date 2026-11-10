import source from './examples/almacen-detallado.optiruta.json?raw'
import { decode } from '../persistence/documentCodec'

/** Independent copy of the converted desktop showcase; original Windows files stay unchanged. */
export function detailedExampleWarehouse() { return decode(source) }
