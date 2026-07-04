const APP_BASE_URL = "http://localhost:3000"
const state = {
  tab: null,
  images: [],
  selected: new Set(),
  collections: [],
}

const els = {
  pageLabel: document.getElementById("pageLabel"),
  refreshButton: document.getElementById("refreshButton"),
  collectionSelect: document.getElementById("collectionSelect"),
  collectionNameInput: document.getElementById("collectionNameInput"),
  newCollectionField: document.getElementById("newCollectionField"),
  selectAllButton: document.getElementById("selectAllButton"),
  clearButton: document.getElementById("clearButton"),
  status: document.getElementById("status"),
  grid: document.getElementById("grid"),
  selectionCount: document.getElementById("selectionCount"),
  importButton: document.getElementById("importButton"),
}

document.addEventListener("DOMContentLoaded", () => {
  els.refreshButton.addEventListener("click", () => void loadCapturedImages())
  els.selectAllButton.addEventListener("click", selectAll)
  els.clearButton.addEventListener("click", clearCapturedImages)
  els.importButton.addEventListener("click", importSelectedImages)
  els.collectionSelect.addEventListener("change", syncCollectionFields)
  void init()
})

async function init() {
  state.tab = await activeTab()
  els.pageLabel.textContent = state.tab?.url || "No active tab"
  await Promise.all([loadCollections(), loadCapturedImages()])
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0] || null)
    })
  })
}

async function loadCapturedImages() {
  if (!state.tab?.id) {
    setStatus("No active tab.", true)
    return
  }
  setStatus("Loading captured image requests...")
  const response = await sendMessage({ type: "CFARM_GET_INTERCEPTED_IMAGES", tabId: state.tab.id })
  if (!response?.ok) {
    setStatus(response?.error || "Failed to load captured images.", true)
    return
  }
  state.images = Array.isArray(response.images) ? response.images : []
  state.selected = new Set(state.images.map((image) => image.url))
  renderImages()
}

async function loadCollections() {
  try {
    const response = await fetch(`${APP_BASE_URL}/api/image-collections`)
    const payload = await response.json()
    state.collections = Array.isArray(payload.collections) ? payload.collections : []
  } catch {
    state.collections = []
  }
  renderCollectionOptions()
}

function renderCollectionOptions() {
  els.collectionSelect.textContent = ""
  const newOption = document.createElement("option")
  newOption.value = "__new__"
  newOption.textContent = "Create new collection"
  els.collectionSelect.appendChild(newOption)

  for (const collection of state.collections) {
    const option = document.createElement("option")
    option.value = collectionKey(collection)
    option.textContent = `${collection.name} (${collection.images?.length || 0})`
    els.collectionSelect.appendChild(option)
  }
  syncCollectionFields()
}

function renderImages() {
  els.grid.textContent = ""
  if (state.images.length === 0) {
    setStatus("No Tumblr image requests captured yet. Reload the Tumblr page with this extension enabled, then open this popup again.")
    updateSelectionCount()
    return
  }
  setStatus(`${state.images.length} image requests captured from this tab.`)
  for (const image of state.images) {
    const tile = document.createElement("button")
    tile.type = "button"
    tile.className = `tile${state.selected.has(image.url) ? " selected" : ""}`
    tile.title = image.url
    tile.addEventListener("click", () => toggleImage(image.url))

    const thumbnail = document.createElement("img")
    thumbnail.src = image.url
    thumbnail.alt = "Captured Tumblr image"
    thumbnail.loading = "lazy"
    tile.appendChild(thumbnail)
    els.grid.appendChild(tile)
  }
  updateSelectionCount()
}

function toggleImage(url) {
  if (state.selected.has(url)) {
    state.selected.delete(url)
  } else {
    state.selected.add(url)
  }
  renderImages()
}

function selectAll() {
  if (state.selected.size === state.images.length) {
    state.selected = new Set()
  } else {
    state.selected = new Set(state.images.map((image) => image.url))
  }
  renderImages()
}

async function clearCapturedImages() {
  if (!state.tab?.id) return
  await sendMessage({ type: "CFARM_CLEAR_INTERCEPTED_IMAGES", tabId: state.tab.id })
  state.images = []
  state.selected = new Set()
  renderImages()
}

async function importSelectedImages() {
  const selectedImages = state.images.filter((image) => state.selected.has(image.url))
  if (selectedImages.length === 0) {
    setStatus("Select at least one image to import.", true)
    return
  }

  const selectedCollection = collectionFromSelect()
  const collectionName = selectedCollection?.name || els.collectionNameInput.value.trim() || "Tumblr import"
  const collectionCreatedAt = selectedCollection?.created_at || ""

  els.importButton.disabled = true
  els.importButton.textContent = "Importing..."
  setStatus(`Importing ${selectedImages.length} images into ${collectionName}...`)

  try {
    const response = await fetch(`${APP_BASE_URL}/api/image-collections/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionName,
        collectionCreatedAt,
        images: selectedImages.map((image) => ({
          url: image.url,
          sourceUrl: state.tab?.url || image.pageUrl || "",
          caption: "",
        })),
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || "Import failed")
    }
    setStatus(`Imported ${payload.imported || selectedImages.length} images into ${payload.collection?.name || collectionName}.`)
    await loadCollections()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Import failed.", true)
  } finally {
    els.importButton.disabled = false
    els.importButton.textContent = "Import"
  }
}

function syncCollectionFields() {
  const isNew = els.collectionSelect.value === "__new__"
  els.newCollectionField.style.display = isNew ? "grid" : "none"
}

function collectionFromSelect() {
  const value = els.collectionSelect.value
  if (value === "__new__") return null
  return state.collections.find((collection) => collectionKey(collection) === value) || null
}

function collectionKey(collection) {
  return `${collection.name}::${collection.created_at}`
}

function updateSelectionCount() {
  els.selectionCount.textContent = `${state.selected.size} selected`
  els.importButton.disabled = state.selected.size === 0
  els.selectAllButton.textContent = state.selected.size === state.images.length && state.images.length > 0 ? "Clear selection" : "Select all"
}

function setStatus(message, isError = false) {
  els.status.textContent = message
  els.status.classList.toggle("error", Boolean(isError))
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message })
        return
      }
      resolve(response)
    })
  })
}
