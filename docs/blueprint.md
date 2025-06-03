# **App Name**: PIV Manager

## Core Features:

- Panel List View: Display panels with filtering and sorting by attributes, including municipality and client.
- Panel History: Visualize the history of movements and status changes for each panel, filtering all available data.
- Import Excel: Import initial PIV panel data from Excel file (one-time setup) to an in-memory datastore. Field 'codigo_parada' used as ID, with robust error checking and validation to prevent duplicates and overwrites.
- Billing Calculation: Calculate monthly billing automatically for each panel based on the installed days. Calculation considers the dates when a panel was in the status 'installed'.
- Monthly Billing View: Display list of all panels showing the billing details.
- Export to Excel: Function to export available data into excel for ease of transferability. Should use the styling of the original Excel file for improved readability.
- Monthly Events Import: Add a feature that allows importing a monthly Excel file (or using a form) to register all status changes for each panel. Includes data validation and duplicate prevention.
- Editable Events and Panel Data: Enable manual editing of all event records and main panel data directly from the app interface.
- Billing Detail View: Allow users to see detailed event history for a specific month when viewing monthly billing for a panel, including non-billable days and reasons.
- Dashboard with Key Metrics: Add a dashboard view displaying total active/inactive panels, total billed amount for the month, days lost due to removals per panel, and warnings for panels with no movement in the last X months.

## Style Guidelines:

- Primary color: Dark blue (#3F51B5) to reflect professionalism and trustworthiness in managing economic data.
- Background color: Very light gray (#F0F0F5) for a clean and neutral backdrop that ensures data visibility.
- Accent color: Teal (#008080) to highlight important actions and interactive elements, such as data filters and export buttons.
- Body and headline font: 'Inter' (sans-serif) for a modern and readable text.
- Use flat, minimalist icons to represent panel states and actions, ensuring clarity and ease of use.
- Employ a tabular layout for presenting panel and billing data, with clear column headers and easily editable fields.
- Use subtle transitions and loading indicators to enhance user experience during data import and calculation processes.