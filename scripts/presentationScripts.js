function slideshowSwitch(event, idName, title){
    var i, slideContent, slideLinks;

    // remove any current presentation from container
    slideContent = document.getElementsByClassName("slideshow");
    for (i = 0; i < slideContent.length; i++){
        slideContent[i].className = slideContent[i].className.replace("slideshow","inactiveSlide");
    }

    // change all buttons to none active
    slideLinks = document.getElementsByClassName("slide_buttons");
    for (i = 0; i <slideLinks.length; i++){
        slideLinks[i].className = slideLinks[i].className.replace("active","");
    }

    // replace slide content and title
    document.getElementById(idName).classList.replace("inactiveSlide", "slideshow");
    document.getElementById("presentation_title").innerHTML = title;
    event.currentTarget.className +="active";
}