#[allow(dead_code)]
pub const CATEGORIES: &[&str] = &[
    "Food",
    "Transport",
    "Entertainment",
    "Utilities",
    "Shopping",
    "Health",
    "Other",
];

pub const INCOME_KEYWORDS: &[&str] = &["salary", "deposit", "payroll", "income", "refund"];

pub const FOOD_KEYWORDS: &[&str] = &[
    "restaurant", "grocery", "starbucks", "mcdonald", "chipotle", "pizza",
    "subway", "taco", "burger", "sushi", "thai", "indian", "olive garden",
    "panera", "domino", "dunkin", "whole foods", "trader joe", "safeway",
    "kroger", "costco", "walmart", "uber eats", "doordash",
];

pub const TRANSPORT_KEYWORDS: &[&str] = &[
    "uber", "lyft", "shell", "chevron", "gas station", "gas ", "metro transit",
    "bus pass", "train ticket", "parking", "transit",
];

pub const ENTERTAINMENT_KEYWORDS: &[&str] = &[
    "netflix", "spotify", "hulu", "apple music", "steam", "playstation",
    "video game", "amc", "regal cinema", "concert", "bowling", "festival",
    "theater",
];

pub const UTILITIES_KEYWORDS: &[&str] = &[
    "electric", "water utility", "internet provider", "phone bill",
    "gas & electric",
];

pub const SHOPPING_KEYWORDS: &[&str] = &[
    "amazon", "target", "best buy", "ikea", "home depot", "nike", "zara",
    "h&m", "old navy", "fashion", "clothing", "electronics", "furniture",
];

pub const HEALTH_KEYWORDS: &[&str] = &[
    "pharmacy", "cvs", "walgreens", "dentist", "doctor", "planet fitness",
    "gym", "yoga", "optometrist", "copay",
];

pub fn categorize_transaction(description: &str, amount: f64) -> &'static str {
    let lower = description.to_lowercase();
    if amount > 0.0 && INCOME_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return "Other";
    }

    if FOOD_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return "Food";
    }
    if TRANSPORT_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return "Transport";
    }
    if ENTERTAINMENT_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return "Entertainment";
    }
    if UTILITIES_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return "Utilities";
    }
    if SHOPPING_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return "Shopping";
    }
    if HEALTH_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return "Health";
    }

    "Other"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_categorize_food() {
        assert_eq!(categorize_transaction("Whole Foods Market", -87.42), "Food");
        assert_eq!(categorize_transaction("Starbucks Coffee", -6.75), "Food");
    }

    #[test]
    fn test_categorize_transport() {
        assert_eq!(categorize_transaction("Shell Gas Station", -45.20), "Transport");
        assert_eq!(categorize_transaction("Uber Ride", -18.60), "Transport");
    }

    #[test]
    fn test_categorize_income() {
        assert_eq!(categorize_transaction("Salary Deposit", 3200.0), "Other");
    }
}
