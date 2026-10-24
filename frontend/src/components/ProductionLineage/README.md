# Production lineage labels

On desktop viewports 760px high or shorter, the entire diagram is hidden instead
of shrinking its images to an unreadable size. Its overview grid wrapper also hides
so no empty row or extra grid gap remains. Both return above that height.

Mobile retains the `OverviewMobileItem` composition but shares desktop's scroll
controller and pinned 900vh sequence. Scroll progress fills the same progress bar,
selects the active item, and progressively reveals its supporting copy in separate
rows within that stage. Earlier rows stay visible as the next rows appear, matching
desktop's cumulative reveal. Mobile grid items fill the available stage height.
Short mobile viewports use tighter row spacing and compact copy sizes; the fixed
text area scrolls when its revealed rows need more room.
Heading, every visible lineage node, and copy use the shared blur timings in both
scroll directions. Mobile nodes carried over from a previous stage also blur on
entry and exit; the outer lineage wrapper only fades to avoid compounding blur.
Mobile stage changes finish the outgoing blur before switching to the latest
requested item; its heading, lineage, and text rows then enter with shared stagger
timings. Reduced-motion mode switches items immediately.
Every item renders its corresponding animated lineage stage. The mobile text
section is 400px high and scrolls when needed. The
lineage row takes the remaining stage height and shares the text's starting grid
column. Its artwork expands within that space, with width-based limits so visible
nodes stay within the mobile width. Mobile lineage also renders on short screens;
tighter spacing keeps the stage within the viewport. Reduced-motion preferences disable
these mobile transitions without affecting desktop motion.

Shared motion styles use transition longhands consistently to avoid shorthand
conflicts during rerenders. Initial node visibility matches the server until the
first layout measurement applies the actual viewport, preventing hydration mismatches.

At xl (1280px) and wider, the second and third visible node positions shift left
by one site-grid column, including its gutter. The first position stays fixed;
connectors and labels follow the measured node positions.

Stage 4 shows only the output grid and campaign outputs below 2xl (1536px).
At 2xl and wider, it also retains the selected version with its attached labels,
dots, and branch connectors.
Each grid image's right dot connects onward through its row; both row ends merge
into the campaign-outputs node. These stage-4 segments remain visible independently
of selected-version visibility.

Connector badges use measured segment midpoints for horizontal placement. Their
top edge sits 8px below the line, independent of badge height and motion transforms.
The branch badge follows the horizontal lead-in before the output rows split;
the delivery badge is centered beneath the tail endpoint after the campaign outputs.
The provenance badge shifts up by half its height plus 4px
from the selected image's top edge.

The version-history node and compact stage 2 use the reusable `PhotoStack`
component. Pass three to five image paths (or `{ src, alt }` entries) through its
`images` prop; the default is the three-model stack. Select `layout="fan"` (the
default) or `layout="diagonal"` to place the first portrait at the top left and
the last at the bottom right. Diagonal portraits stay unrotated, and the last
portrait is layered above the rest. Both layouts calculate portrait width,
horizontal overlap, vertical offset, and stacking order from the image count.
Portraits stay borderless; CSS positioning creates the layered layout at render
time.

Each `PhotoStack` image is cropped into a uniform 2:3 card, regardless of the
source file's dimensions. Lineage connector geometry measures every rendered
card and uses their combined left/right edges and vertical midpoint. The stack
container has an explicit 1.2:1 aspect ratio so node centering and slot placement
use the full layout box instead of the first portrait's dimensions.

The leftmost visible node hides its entry dots, and the rightmost visible node
hides its exit dots except on campaign outputs, whose right dot stays visible.
The delivery tail dot remains visible as a separate endpoint.
Interior dots keep their existing stage visibility and transitions.

The diagram, its overview wrapper, and output frames allow label overflow. All six
output frames share the first row's 1199:1312 proportions, with top-aligned cover
cropping so taller portraits lose content at the bottom. Compact outputs also crop
from the bottom within their existing equal grid cells.

Badge renders its own element, so label rules use `:global(...)` beneath the scoped
`.production-lineage` ancestor to cross the styled-jsx component boundary.
