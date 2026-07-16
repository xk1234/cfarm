"use client"

import { useMemo } from "react"
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GetRowIdParams,
  type RowClickedEvent,
} from "ag-grid-community"
import { AgGridReact } from "ag-grid-react"

import { cn } from "@/lib/utils"

ModuleRegistry.registerModules([AllCommunityModule])

export function AgDataTable<TData extends object>({
  rows,
  columns,
  getRowId,
  onRowClick,
  emptyMessage = "No records",
  className,
  pageSize = 20,
}: {
  rows: TData[]
  columns: ColDef<TData>[]
  getRowId?: (row: TData) => string
  onRowClick?: (row: TData) => void
  emptyMessage?: string
  className?: string
  pageSize?: number
}) {
  const defaultColDef = useMemo<ColDef<TData>>(
    () => ({
      filter: true,
      resizable: true,
      sortable: true,
      minWidth: 110,
    }),
    []
  )

  return (
    <div
      className={cn(
        "app-card overflow-hidden",
        className
      )}
    >
      <div className="h-[620px] min-w-0">
        <AgGridReact<TData>
          className="app-data-grid ag-theme-quartz h-full w-full"
          theme="legacy"
          rowData={rows}
          columnDefs={columns}
          defaultColDef={defaultColDef}
          getRowId={
            getRowId
              ? (params: GetRowIdParams<TData>) => getRowId(params.data)
              : undefined
          }
          onRowClicked={
            onRowClick
              ? (event: RowClickedEvent<TData>) => {
                  if (event.data) onRowClick(event.data)
                }
              : undefined
          }
          animateRows
          pagination
          paginationPageSize={pageSize}
          paginationPageSizeSelector={[10, 20, 50, 100]}
          suppressCellFocus
          overlayNoRowsTemplate={`<span class="app-data-grid-empty">${emptyMessage}</span>`}
        />
      </div>
    </div>
  )
}
