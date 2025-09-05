const fs = require('fs');

// Read the JSON file
fs.readFile('subscribedLog.json', 'utf8', (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  // Parse the JSON data
  const jsonData = JSON.parse(data);

  // Sort the data by days (in descending order)
  const sortedData = Object.entries(jsonData)
    .sort((a, b) => b[1].days - a[1].days) // Sort by days in descending order
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  // Write the sorted data back to the file
  fs.writeFile('subscribedLog.json', JSON.stringify(sortedData, null, 2), 'utf8', (err) => {
    if (err) {
      console.error("Error writing to file:", err);
      return;
    }
    console.log("Data sorted by days and saved to SubscribedLog.json");
  });
});
