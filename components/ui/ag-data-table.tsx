"use client"

import { useMemo } from "react"
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type CellKeyDownEvent,
  type GetRowIdParams,
  type RowClickedEvent,
  themeQuartz,
} from "ag-grid-community"
import { AgGridReact } from "ag-grid-react"

import { cn } from "@/lib/utils"

ModuleRegistry.registerModules([AllCommunityModule])

const appDataGridTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#242421",
  borderColor: "#e1e0d8",
  fontFamily: "var(--font-sans)",
  headerBackgroundColor: "#fbfbf7",
  headerTextColor: "#242421",
  rowHoverColor: "#f7f5fc",
  oddRowBackgroundColor: "#ffffff",
  selectedRowBackgroundColor: "#f0ebfb",
  wrapperBorderRadius: "10px",
  cellHorizontalPadding: "16px",
  headerColumnResizeHandleColor: "#d7d6cf",
  headerHeight: "46px",
  rowHeight: "52px",
})

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
    <div className={cn("app-card overflow-hidden", className)}>
      <div className="h-[620px] min-w-0">
        <AgGridReact<TData>
          className="app-data-grid h-full w-full"
          theme={appDataGridTheme}
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
          onCellKeyDown={
            onRowClick
              ? (event: CellKeyDownEvent<TData>) => {
                  if (
                    event.data &&
                    event.event instanceof KeyboardEvent &&
                    event.event.key === "Enter"
                  ) {
                    onRowClick(event.data)
                  }
                }
              : undefined
          }
          animateRows
          pagination
          paginationPageSize={pageSize}
          paginationPageSizeSelector={[10, 20, 50, 100]}
          overlayNoRowsTemplate={`<span class="app-data-grid-empty">${emptyMessage}</span>`}
        />
      </div>
    </div>
  )
}
