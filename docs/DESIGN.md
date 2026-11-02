# Reference direction

The second supplied reference informs the literary type, sepia photography, warm cream surfaces, dark brown backgrounds, and restrained paper texture. The theme continues through product details, the bag, account dialogs, checkout, orders, and admin controls. Product records and prices retain the existing application behavior.

## Typography

The reference names **Chapbook**. This implementation uses **IM Fell English**, an open font with an old printed-book character, as an approximation. It is not the exact reference typeface. No Chapbook font file is bundled.

IM Fell English is included locally from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/imfellenglish). Its SIL Open Font License is preserved in `static/fonts/OFL-IM-Fell-English.txt`. Body copy uses Georgia with a serif fallback. Controls use system sans-serif fonts; secondary labels use Courier New.

## Photography

The hero uses this [antique typewriter and lamp photograph on Unsplash](https://unsplash.com/photos/fGrb35rHPCQ), downloaded from `https://images.unsplash.com/photo-1652616555250-57d49a2034e2` with `auto=format&fit=crop&w=1800&q=85`.

The original downloaded image is bundled as `static/images/typewriter.jpg`; colour treatments are applied through CSS. See [all photo credits](IMAGE-CREDITS.md) and the [Unsplash license](https://unsplash.com/license). The supplied reference screenshot is not embedded in the application.

## Verification

Browser checks covered font loading, categories, search, sorting, product details, the bag, registration, checkout, and order history. Screens were checked at 1440px, 390px, and 320px; no horizontal overflow or JavaScript errors were observed. Order history and checkout were also exercised at the mobile size. API tests continue to pass. Screenshots use local sample data.
