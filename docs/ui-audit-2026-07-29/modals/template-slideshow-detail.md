# Terminal modal: Template slideshow detail

Path: Home → New Automation → template card → Open.

Desktop is a large centered surface around x=130, y=27, 1180 × 846. Close is a 36 × 36 icon on the left of the header, while Export PNGs is a disabled 36 × 36 icon on the far right. The title appears beside the left close control. Publishing Details contains collapsible Title and Description + hashtags with 28–32 px copy controls.

This left-side close placement conflicts with the top-right close used in most other products and in CFarm's parent dialog. Use the platform/dialog convention consistently: close top-right, back top-left only when returning to the parent browser is a distinct action. Do not style a disabled export action as the strongest purple control; show “No slides to export” in the empty canvas and omit export until available.

The example inspected had no slideshow but still devoted most of the modal to an empty preview. Reduce the empty canvas and bring the explanation/next action above the fold. Title and description inputs should look like editable fields rather than borderless display text.

On mobile this should be a full-screen page/sheet with media first, details second, and a sticky action bar. Copy controls need 36–40 px hit areas and visible confirmation.
