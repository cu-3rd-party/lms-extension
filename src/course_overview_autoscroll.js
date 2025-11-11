async function activateCourseOverviewAutoscroll() {
    try {
        const courseOverview = await waitForElement('cu-course-overview', 10000);
        const existingAccordion = courseOverview.querySelector('tui-accordion.cu-accordion.themes-accordion');
        
        if (!existingAccordion) {
            console.log('Accordion not found in cu-course-overview');
            return;
        }

        const accordionItems = Array.from(existingAccordion.querySelectorAll('tui-accordion-item'))
            .filter(item => item.getAttribute('data-item-type') !== 'future-exam');

        if (accordionItems.length === 0) {
            console.log('No non-future-exam accordion items found');
            return;
        }

        const lastItem = accordionItems[accordionItems.length - 1];
        console.log('Scrolling to last accordion item:', lastItem);
        lastItem.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });

        
        const button = lastItem.querySelector('button');
        if (button) {
            button.click();
        }

    } catch (e) {
        console.log('cu-course-overview not found within timeout:', e);
    }
}