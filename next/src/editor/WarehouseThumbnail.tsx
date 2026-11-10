import { memo } from 'react'
import { allElements, elementKind, footprint, type WarehouseDocument } from '../warehouse/document'

/** A lightweight plan preview; never creates a WebGL context. */
export const WarehouseThumbnail = memo(function WarehouseThumbnail({ document: doc }: { document: WarehouseDocument }) {
  return <svg viewBox={`0 0 ${doc.widthMm} ${doc.depthMm}`} className="recent-thumbnail" aria-hidden="true">
    <rect width={doc.widthMm} height={doc.depthMm} fill="var(--panel)"/>
    {allElements(doc).sort((a, b) => Number(elementKind(b) === 'zone') - Number(elementKind(a) === 'zone')).map(element => {
      const bounds = footprint(element)
      return <rect key={element.id} x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.d} fill={element.color} fillOpacity={elementKind(element) === 'zone' ? .22 : 1}/>
    })}
  </svg>
})
