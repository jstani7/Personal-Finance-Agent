use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=frontend/dist");
    let dist_dir = Path::new("frontend/dist");
    if !dist_dir.exists() {
        std::fs::create_dir_all(dist_dir).ok();
        std::fs::write(
            dist_dir.join("index.html"),
            "<!DOCTYPE html><html><head><title>Personal Finance Agent</title></head><body><div id=\"root\">Building frontend...</div></body></html>",
        ).ok();
    }
}
