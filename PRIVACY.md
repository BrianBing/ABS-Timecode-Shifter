# Privacy Policy for ABS Timecode Shifter

Last Updated: May 2026

Your privacy is extremely important to us. This Privacy Policy describes how the **ABS Timecode Shifter** Google Docs Add-on (the "Add-on") handles your data.

## 1. No Data Collection or Storage
The Add-on runs entirely within your Google Workspace environment using Google Apps Script. 
* **No personal data** (such as names, email addresses, or account details) is collected, stored, or transmitted.
* **No document content** is sent to external servers. All text scanning and timecode shifting operations are performed locally and directly on the active document you have open.

## 2. Google API Scopes Used
To function correctly, the Add-on requests permission to access the following scopes:
* **`https://www.googleapis.com/auth/documents.currentonly`**: Used to search for and shift timecodes inside the document you currently have open. It does not read or access any other files in your Google Drive.
* **`https://www.googleapis.com/auth/script.container.ui`**: Used to build and display the sidebar interface where you control settings (e.g. choose frame rate, shift direction, and search scope).

## 3. Third-Party Sharing
Since no data is collected, we do not share, sell, or trade any user information with third parties.

## 4. Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be posted directly in this file within the repository.

## 5. Contact
If you have any questions or feedback about this Privacy Policy, please open an issue on our [GitHub Issues page](https://github.com/YOUR_USERNAME/abs-timecode-shifter/issues).
