// File handler functionality
const selectedFiles = {
  files: [],
  folder: null,
};

// Function to handle file selection
function handleFileSelection() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;

  input.onchange = (event) => {
    // Get the selected files
    const files = Array.from(event.target.files);
    selectedFiles.files = files;

    // Update the UI to show selected files
    updateSelectionDisplay();
  };

  input.click();
}

// Function to update the UI with selected files/folder
function updateSelectionDisplay() {
  const buttonSection = document.getElementById("file-select-buttons");
  const selectedItemsContainer = document.getElementById(
    "selected-items-container"
  );
  selectedItemsContainer.innerHTML = "";
  buttonSection.style.display = "none";

  if (selectedFiles.files.length === 0) {
    selectedItemsContainer.style.display = "none";
    buttonSection.style.display = "flex";
    return;
  }

  // If we have files selected
  if (selectedFiles.files.length > 0) {
    const fileCountHeading = document.createElement("h3");
    fileCountHeading.textContent = `Selected ${selectedFiles.files.length} files`;
    fileCountHeading.className = "text-lg font-semibold mb-2";
    selectedItemsContainer.appendChild(fileCountHeading);

    const files = document.createElement("div");
    files.classList = "flex gap-2 flex-wrap";

    // Display file list
    selectedFiles.files.forEach((file) => {
      const fileItem = document.createElement("div");
      fileItem.className =
        "selection-btn py- flex cursor-pointer flex-col items-center justify-center rounded-lg bg-gray-700 px-4 py-3";

      // File icon
      const fileIcon = document.createElement("div");
      fileIcon.innerHTML = `
        <svg class="mb-1 h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
      `;

      fileItem.appendChild(fileIcon);
      files.appendChild(fileItem);
    });
    selectedItemsContainer.appendChild(files);

    const clearButton = document.createElement("button");
    clearButton.id = "clear-select-btn";
    clearButton.className =
      "absolute cursor-pointer right-0 top-0 m-2 rounded-full";
    clearButton.innerHTML = `
        <svg
            class="mb-1 h-6 w-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
            ></path>
        </svg>
    `;
    clearButton.onclick = clearSelections;
    selectedItemsContainer.appendChild(clearButton);

    selectedItemsContainer.style.display = "flex";
  }
}

// Utility function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Function to clear all selections
function clearSelections() {
  selectedFiles.files = [];
  selectedFiles.folder = null;
  updateSelectionDisplay();
}

// Function to initiate sending to a device
function sendToDevice(deviceElement) {
  // In a real app, this would initiate the file transfer
  const deviceName = deviceElement.querySelector(".device-name").textContent;
  let message = "";

  if (selectedFiles.files.length > 0) {
    message = `Sending ${selectedFiles.files.length} files to ${deviceName}`;
  } else if (selectedFiles.folder) {
    message = `Sending folder ${selectedFiles.folder.name} to ${deviceName}`;
  }

  alert(message);
}
