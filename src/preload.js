(() => {
  const style = document.createElement('style');
  style.id = 'course-archiver-preload-css';
  style.textContent = `
    ul.course-list {
      opacity: 0 !important;
      visibility: hidden !important;
    }
    ul.course-list.course-archiver-ready {
      opacity: 1 !important;
      visibility: visible !important;
    }
  `;
  document.documentElement.appendChild(style);
})();
