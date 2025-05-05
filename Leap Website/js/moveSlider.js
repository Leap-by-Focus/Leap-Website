document.addEventListener('DOMContentLoaded', function () {
  const elements = document.querySelectorAll(".custom-compare");

  const options = {
    controlColor: "#73c781",
    controlShadow: false,
    addCircle: true,
    showLabels: true,
    labelOptions: {
      before: 'Leap',
      after: 'C#',
      onHover: false
    },
    verticalMode: false,
    startingPoint: 50,
  };

  elements.forEach(element => {
    new ImageCompare(element, options).mount();
  });
});