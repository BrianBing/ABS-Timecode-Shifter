const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

function ensureDirectoryExistence(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function build() {
  console.log('Starting build process...');
  ensureDirectoryExistence(DIST_DIR);

  // 1. Read the shared timecode utility
  const timecodePath = path.join(SRC_DIR, 'timecode.js');
  let timecodeUtils = '';
  if (fs.existsSync(timecodePath)) {
    timecodeUtils = fs.readFileSync(timecodePath, 'utf8');
    console.log('Successfully read shared timecode.js');
  } else {
    console.error('Warning: timecode.js not found!');
  }

  // 2. Build Code.js
  const codeSrcPath = path.join(SRC_DIR, 'Code.js');
  if (fs.existsSync(codeSrcPath)) {
    let codeContent = fs.readFileSync(codeSrcPath, 'utf8');
    codeContent = codeContent.replace('// TIMECODE_UTILS_PLACEHOLDER', timecodeUtils);
    fs.writeFileSync(path.join(DIST_DIR, 'Code.js'), codeContent, 'utf8');
    console.log('Successfully compiled dist/Code.js');
    
    // Write duplicate in root for simple copy-pasting
    fs.writeFileSync(path.join(__dirname, 'DEPLOY_Code.gs'), codeContent, 'utf8');
    console.log('Successfully compiled DEPLOY_Code.gs in project root');
  } else {
    console.error('Error: src/Code.js not found!');
  }

  // 3. Build Sidebar.html
  const htmlSrcPath = path.join(SRC_DIR, 'sidebar.html');
  const cssSrcPath = path.join(SRC_DIR, 'sidebar.css');
  const jsSrcPath = path.join(SRC_DIR, 'sidebar.js');

  if (fs.existsSync(htmlSrcPath) && fs.existsSync(cssSrcPath) && fs.existsSync(jsSrcPath)) {
    let htmlContent = fs.readFileSync(htmlSrcPath, 'utf8');
    const cssContent = fs.readFileSync(cssSrcPath, 'utf8');
    let jsContent = fs.readFileSync(jsSrcPath, 'utf8');

    // Inline TimecodeUtils into sidebar.js contents
    jsContent = jsContent.replace('// TIMECODE_UTILS_PLACEHOLDER', timecodeUtils);

    // Inline CSS and JS into HTML
    htmlContent = htmlContent.replace('/* CSS_PLACEHOLDER */', cssContent);
    htmlContent = htmlContent.replace('/* JS_PLACEHOLDER */', jsContent);

    fs.writeFileSync(path.join(DIST_DIR, 'Sidebar.html'), htmlContent, 'utf8');
    console.log('Successfully compiled dist/Sidebar.html');

    // Write duplicate in root for simple copy-pasting
    fs.writeFileSync(path.join(__dirname, 'DEPLOY_Sidebar.html'), htmlContent, 'utf8');
    console.log('Successfully compiled DEPLOY_Sidebar.html in project root');
  } else {
    console.error('Error: Frontend files (sidebar.html/css/js) missing!');
  }

  // 4. Copy appsscript.json
  const appsscriptSrcPath = path.join(SRC_DIR, 'appsscript.json');
  if (fs.existsSync(appsscriptSrcPath)) {
    fs.copyFileSync(appsscriptSrcPath, path.join(DIST_DIR, 'appsscript.json'));
    console.log('Successfully copied dist/appsscript.json');
  } else {
    console.error('Error: src/appsscript.json not found!');
  }

  console.log('Build completed successfully.');
}

build();
