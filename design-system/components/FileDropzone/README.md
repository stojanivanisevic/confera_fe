# FileDropzone

Drag-and-drop upload area with a list of chosen files, sizes, upload progress and remove.

- The consumer owns the files array, the upload and the checks (type, size: 20 MB in Confera).
- A file the consumer refused gets `error` ("Larger than 20 MB: choose a smaller file"): its row is drawn in the error colour and says why under the name, and its remove button is described by the reason (2.3.0).
- The progress of an upload and the reason of a refusal take a line of their own under the file; the remove button stays at the right of the file's line (2.3.0; it wrapped under the bar).
- The label names the drop area, and the hint and the message describe it (version 2). The built-in texts ("Drop files here or click to choose", "Uploading …", "Remove …") come from the labels and can be translated.
