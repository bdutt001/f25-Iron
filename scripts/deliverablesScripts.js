function smallScreen(event){
    if(event.matches){
        document.getElementById("currentProcess").classList.replace("left_pic", "center_pic");
        document.getElementById("solutionProcess").classList.replace("right_pic", "center_pic");
        document.getElementById("userRisks").classList.replace("left_pic", "center_pic");
        document.getElementById("techRisks").classList.replace("right_pic", "center_pic");
    }
}
function largeScreen(event){
    if(event.matches){
        document.getElementById("currentProcess").classList.replace("center_pic", "left_pic");
        document.getElementById("solutionProcess").classList.replace("center_pic", "right_pic");
        document.getElementById("userRisks").classList.replace("center_pic", "left_pic");
        document.getElementById("techRisks").classList.replace("center_pic", "right_pic");
    }
}
const mediaQuerySmall = window.matchMedia("(max-width: 980px)");
mediaQuerySmall.addEventListener("change", smallScreen);
let mediaQueryLarge = window.matchMedia("(min-width: 981px)");
mediaQueryLarge.addEventListener("change", largeScreen);

if(mediaQuerySmall.matches){
    smallScreen(mediaQuerySmall);
}
if(mediaQueryLarge.matches){
    largeScreen(mediaQueryLarge);
}