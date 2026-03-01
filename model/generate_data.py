"""
Synthetic PII dataset generator v2 for training a word-level NER model.

Key improvements over v1:
- 200k samples (4x larger)
- Hundreds of diverse sentence templates with realistic conversational context
- 50% purely negative samples so the model learns NOT to tag ordinary text
- Downloads real name lists from US Census data for realistic name generation
- Proper punctuation handling (periods/commas attached to PII words)
- Multi-locale Faker data for international variety
"""

import json
import random
import re
import string
import urllib.request
from pathlib import Path
from faker import Faker

# Locales for international variety
LOCALES = ["en_US", "en_GB", "en_AU", "en_CA", "fr_FR", "de_DE", "es_ES", "it_IT"]
fake_by_locale = {loc: Faker(loc) for loc in LOCALES}
fake = fake_by_locale["en_US"]

Faker.seed(42)
random.seed(42)

NUM_SAMPLES = 200_000
VAL_RATIO = 0.1
OUTPUT_DIR = Path(__file__).parent / "data"

BIO_LABELS = [
    "O",
    "B-NAME", "I-NAME",
    "B-EMAIL", "I-EMAIL",
    "B-PHONE", "I-PHONE",
    "B-FINANCIAL", "I-FINANCIAL",
    "B-SSN", "I-SSN",
    "B-ID", "I-ID",
    "B-ADDRESS", "I-ADDRESS",
    "B-SECRET", "I-SECRET",
]

# ---------------------------------------------------------------------------
# Name lists (downloaded from Census / curated)
# ---------------------------------------------------------------------------

CENSUS_FIRST_URL = "https://raw.githubusercontent.com/dominictarr/random-name/master/first-names.json"
CENSUS_LAST_URL = "https://raw.githubusercontent.com/dominictarr/random-name/master/names.json"

_first_names: list[str] = []
_last_names: list[str] = []


def _download_json(url: str) -> list[str]:
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            return [n.strip().title() for n in data if isinstance(n, str) and len(n) > 1]
    except Exception as e:
        print(f"  Warning: could not download {url}: {e}")
        return []


def get_first_names() -> list[str]:
    global _first_names
    if not _first_names:
        print("Downloading first-name list...")
        downloaded = _download_json(CENSUS_FIRST_URL)
        faker_names = list({fake_by_locale[loc].first_name() for loc in LOCALES for _ in range(500)})
        _first_names = list(set(downloaded + faker_names))
        if len(_first_names) < 100:
            _first_names = faker_names
        random.shuffle(_first_names)
        print(f"  {len(_first_names)} first names loaded")
    return _first_names


def get_last_names() -> list[str]:
    global _last_names
    if not _last_names:
        print("Downloading last-name list...")
        downloaded = _download_json(CENSUS_LAST_URL)
        faker_names = list({fake_by_locale[loc].last_name() for loc in LOCALES for _ in range(500)})
        _last_names = list(set(downloaded + faker_names))
        if len(_last_names) < 100:
            _last_names = faker_names
        random.shuffle(_last_names)
        print(f"  {len(_last_names)} last names loaded")
    return _last_names


# ---------------------------------------------------------------------------
# Rich filler / negative sentences
# ---------------------------------------------------------------------------

NEGATIVE_SENTENCES = [
    # Ordinary conversation
    "I am testing an extension.",
    "Can you help me with my homework?",
    "The weather is really nice today.",
    "Please summarize this article for me.",
    "What is the capital of France?",
    "How do I sort a list in Python?",
    "Thank you for your help!",
    "I need to finish this project by Friday.",
    "Could you explain quantum computing?",
    "What are the best practices for machine learning?",
    "The meeting is scheduled for 3 PM.",
    "I am working on a new feature for the app.",
    "This is a test of the emergency broadcast system.",
    "Let me know if you have any questions.",
    "The quick brown fox jumps over the lazy dog.",
    "I have a question about the assignment.",
    "Is there a faster way to do this?",
    "Can you translate this to Spanish?",
    "I really enjoyed the movie last night.",
    "The restaurant down the street is amazing.",
    "My favorite color is blue.",
    "I think we should use a different approach.",
    "The train leaves at half past six.",
    "She said the report would be ready tomorrow.",
    "We need to discuss the budget for next quarter.",
    "The server is running on port 8080.",
    "I updated the dependencies in the project.",
    "The function returns a boolean value.",
    "There are several ways to solve this problem.",
    "The deadline for submissions is next Monday.",
    "I will be on vacation next week.",
    "The team meeting was very productive.",
    "Can you review my pull request?",
    "I think the bug is in the authentication module.",
    "The database migration completed successfully.",
    "We should add unit tests for this feature.",
    "The performance improved after the optimization.",
    "I am learning about natural language processing.",
    "The API documentation needs to be updated.",
    "Can you walk me through the deployment process?",
    # Sentences with capitalized words that are NOT names
    "The Internet is a powerful tool.",
    "I love visiting the Grand Canyon.",
    "The United States has fifty states.",
    "JavaScript and Python are popular languages.",
    "React is great for building user interfaces.",
    "The Pacific Ocean is the largest ocean.",
    "Apple released a new product today.",
    "Google Maps is useful for navigation.",
    "The Amazon River flows through South America.",
    "Microsoft Teams is used for collaboration.",
    "I watched a documentary about the Roman Empire.",
    "The Brooklyn Bridge connects Manhattan and Brooklyn.",
    "Stanford University is located in California.",
    "The Supreme Court issued a ruling today.",
    "Tesla reported higher earnings this quarter.",
    "Mount Everest is the tallest mountain in the world.",
    "The European Union consists of many member states.",
    "NASA launched a new satellite last week.",
    "Harvard Business Review published an interesting article.",
    "The Olympic Games will be held next year.",
]


def random_filler() -> str:
    """Generate diverse filler text that teaches the model what is NOT PII."""
    roll = random.random()
    if roll < 0.30:
        return random.choice(NEGATIVE_SENTENCES)
    elif roll < 0.55:
        return fake.sentence(nb_words=random.randint(4, 15))
    elif roll < 0.75:
        return fake.text(max_nb_chars=random.randint(40, 120))
    elif roll < 0.85:
        loc = random.choice(LOCALES)
        return fake_by_locale[loc].sentence(nb_words=random.randint(4, 12))
    else:
        # Conversational lead-ins
        return random.choice([
            "I need help with something.",
            "Can you check this for me?",
            "Please process the following information.",
            "Here is the information you requested.",
            "My details are as follows.",
            "Update the record with this data.",
            "According to the file, the details are below.",
            "Please forward this to the appropriate team.",
            "The following contains sensitive information.",
            "I want to share the following privately.",
            "Below are the contact details.",
            "The billing information is listed here.",
            "For your records, here are the details.",
            "This message contains personal data.",
            "Please keep this information confidential.",
        ])


# ---------------------------------------------------------------------------
# PII context templates (the sentence around PII)
# ---------------------------------------------------------------------------

NAME_CONTEXTS = [
    "My name is {pii}.",
    "Hi, I'm {pii}.",
    "Hello, my name is {pii} and I need help.",
    "This is {pii} speaking.",
    "Please contact {pii} regarding this issue.",
    "The patient's name is {pii}.",
    "The account holder is {pii}.",
    "Dear {pii}, we have received your request.",
    "I spoke with {pii} earlier today.",
    "The recipient is {pii}.",
    "{pii} submitted the application.",
    "Please reach out to {pii} for more details.",
    "The manager, {pii}, approved the request.",
    "I am {pii} and I would like to update my profile.",
    "Can you look up the file for {pii}?",
    "Greetings, this is {pii}.",
    "The customer {pii} called about an issue.",
    "Hey, it's {pii} here.",
    "My friend {pii} recommended your service.",
    "{pii} is the emergency contact.",
    "Forward this to {pii} please.",
    "The order was placed by {pii}.",
]

EMAIL_CONTEXTS = [
    "My email is {pii}.",
    "You can reach me at {pii}.",
    "Send the report to {pii}.",
    "Please email {pii} with the details.",
    "The contact email is {pii}.",
    "Forward this to {pii} please.",
    "My work email address is {pii}.",
    "Reach out via {pii} for inquiries.",
    "The reply-to address is {pii}.",
    "I can be contacted at {pii} any time.",
]

PHONE_CONTEXTS = [
    "My phone number is {pii}.",
    "Call me at {pii}.",
    "You can reach me at {pii}.",
    "My cell number is {pii}.",
    "The contact number is {pii}.",
    "Please call {pii} to confirm.",
    "My mobile is {pii}.",
    "Reach me on {pii} during business hours.",
    "The office number is {pii}.",
    "For urgent matters, call {pii}.",
]

SSN_CONTEXTS = [
    "My social security number is {pii}.",
    "My SSN is {pii}.",
    "The SSN on file is {pii}.",
    "Social security: {pii}.",
    "Please verify SSN {pii}.",
    "The patient SSN is {pii}.",
    "For tax purposes my SSN is {pii}.",
    "My social is {pii}.",
]

FINANCIAL_CONTEXTS = [
    "My credit card number is {pii}.",
    "The card number is {pii}.",
    "Please charge {pii}.",
    "Payment card: {pii}.",
    "My Visa ends in {pii}.",
    "The billing card is {pii}.",
    "Use card number {pii} for payment.",
    "My debit card number is {pii}.",
    "The account card is {pii}.",
    "Process payment for card {pii}.",
]

ADDRESS_CONTEXTS = [
    "I live at {pii}.",
    "My address is {pii}.",
    "Please ship to {pii}.",
    "The delivery address is {pii}.",
    "My home address is {pii}.",
    "Send the package to {pii}.",
    "The billing address is {pii}.",
    "My mailing address is {pii}.",
    "We are located at {pii}.",
    "The office address is {pii}.",
]

ID_CONTEXTS = [
    "My passport number is {pii}.",
    "License number: {pii}.",
    "My driver's license is {pii}.",
    "ID number: {pii}.",
    "The membership ID is {pii}.",
    "My employee ID is {pii}.",
    "Badge number {pii}.",
    "The reference number is {pii}.",
    "My registration number is {pii}.",
    "Permit ID: {pii}.",
]

SECRET_CONTEXTS = [
    "My password is {pii}.",
    "The API key is {pii}.",
    "Use this token: {pii}.",
    "The secret key is {pii}.",
    "My login password is {pii}.",
    "The access token is {pii}.",
    "Here is my private key: {pii}.",
    "The encryption key is {pii}.",
    "Use password {pii} to log in.",
    "The service account key is {pii}.",
]


# ---------------------------------------------------------------------------
# PII value generators
# ---------------------------------------------------------------------------

def gen_name() -> tuple[str, str]:
    """Generate a realistic name (first, first-last, or with titles)."""
    firsts = get_first_names()
    lasts = get_last_names()
    roll = random.random()
    if roll < 0.15:
        name = random.choice(firsts)
    elif roll < 0.80:
        name = f"{random.choice(firsts)} {random.choice(lasts)}"
    elif roll < 0.90:
        title = random.choice(["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."])
        name = f"{title} {random.choice(firsts)} {random.choice(lasts)}"
    else:
        name = f"{random.choice(firsts)} {random.choice([chr(c) for c in range(65, 91)])}. {random.choice(lasts)}"
    return name, "NAME"


def gen_email() -> tuple[str, str]:
    loc = random.choice(LOCALES)
    return fake_by_locale[loc].email(), "EMAIL"


def gen_phone() -> tuple[str, str]:
    formats = [
        lambda: fake.phone_number(),
        lambda: f"+1 ({fake.msisdn()[3:6]}) {fake.msisdn()[6:9]}-{fake.msisdn()[9:13]}",
        lambda: f"({fake.msisdn()[3:6]}) {fake.msisdn()[6:9]}-{fake.msisdn()[9:13]}",
        lambda: f"+44 {random.randint(7000,7999)} {random.randint(100000,999999)}",
        lambda: f"+49 {random.randint(150,179)} {random.randint(1000000,9999999)}",
        lambda: f"{random.randint(200,999)}-{random.randint(200,999)}-{random.randint(1000,9999)}",
        lambda: f"1-{random.randint(200,999)}-{random.randint(200,999)}-{random.randint(1000,9999)}",
    ]
    phone = random.choice(formats)()
    return phone, "PHONE"


def gen_ssn() -> tuple[str, str]:
    area = random.randint(1, 899)
    if area == 666:
        area = 667
    group = random.randint(1, 99)
    serial = random.randint(1, 9999)
    sep = random.choice(["-", " ", ""])
    ssn = f"{area:03d}{sep}{group:02d}{sep}{serial:04d}"
    return ssn, "SSN"


def gen_credit_card() -> tuple[str, str]:
    cc = fake.credit_card_number()
    if random.random() < 0.5 and len(cc) >= 16:
        cc = f"{cc[:4]} {cc[4:8]} {cc[8:12]} {cc[12:16]}"
    return cc, "FINANCIAL"


def gen_address() -> tuple[str, str]:
    loc = random.choice(["en_US", "en_GB", "en_AU", "en_CA"])
    addr = fake_by_locale[loc].street_address()
    if random.random() < 0.4:
        addr += f", {fake_by_locale[loc].city()}"
    if random.random() < 0.3:
        addr += f", {fake_by_locale[loc].state_abbr() if loc == 'en_US' else fake_by_locale[loc].city()}"
    if random.random() < 0.3:
        addr += f" {fake_by_locale[loc].zipcode() if loc == 'en_US' else fake_by_locale[loc].postcode()}"
    return addr, "ADDRESS"


def gen_id_number() -> tuple[str, str]:
    patterns = [
        lambda: "".join(random.choices(string.ascii_uppercase, k=2)) + "".join(random.choices(string.digits, k=7)),
        lambda: fake.bothify("??#######").upper(),
        lambda: "".join(random.choices(string.ascii_uppercase + string.digits, k=9)),
        lambda: f"{random.choice(string.ascii_uppercase)}{random.randint(10000000, 99999999)}",
    ]
    return random.choice(patterns)(), "ID"


def gen_secret() -> tuple[str, str]:
    patterns = [
        lambda: fake.password(length=random.randint(8, 24)),
        lambda: f"sk-{''.join(random.choices(string.ascii_letters + string.digits, k=32))}",
        lambda: f"AKIA{''.join(random.choices(string.ascii_uppercase + string.digits, k=16))}",
        lambda: f"ghp_{''.join(random.choices(string.ascii_letters + string.digits, k=30))}",
        lambda: f"xoxb-{''.join(random.choices(string.digits, k=12))}-{''.join(random.choices(string.ascii_letters + string.digits, k=24))}",
        lambda: "".join(random.choices(string.ascii_letters + string.digits + "_-", k=random.randint(20, 48))),
    ]
    return random.choice(patterns)(), "SECRET"


PII_GENERATORS = [gen_name, gen_email, gen_phone, gen_ssn, gen_credit_card, gen_address, gen_id_number, gen_secret]
PII_WEIGHTS = [30, 15, 15, 7, 10, 10, 5, 8]
PII_CONTEXTS = {
    "NAME": NAME_CONTEXTS,
    "EMAIL": EMAIL_CONTEXTS,
    "PHONE": PHONE_CONTEXTS,
    "SSN": SSN_CONTEXTS,
    "FINANCIAL": FINANCIAL_CONTEXTS,
    "ADDRESS": ADDRESS_CONTEXTS,
    "ID": ID_CONTEXTS,
    "SECRET": SECRET_CONTEXTS,
}


# ---------------------------------------------------------------------------
# Sample generators
# ---------------------------------------------------------------------------

def tokenize_and_label(sentence: str, pii_value: str, pii_type: str) -> dict:
    """
    Given a sentence containing pii_value, produce word-level BIO tags.
    Handles punctuation attached to PII (e.g. 'Jack.' → 'Jack' + '.').
    """
    words = sentence.split()
    labels = ["O"] * len(words)

    # Find the PII span by joining words and matching
    pii_words = pii_value.split()
    pii_len = len(pii_words)

    for i in range(len(words) - pii_len + 1):
        window = words[i:i + pii_len]
        # strip trailing punctuation for comparison
        stripped = [re.sub(r'[.,;:!?\'")\]]+$', '', w) for w in window]
        pii_stripped = [re.sub(r'[.,;:!?\'")\]]+$', '', w) for w in pii_words]
        if stripped == pii_stripped:
            labels[i] = f"B-{pii_type}"
            for j in range(1, pii_len):
                labels[i + j] = f"I-{pii_type}"
            break

    return {"words": words, "labels": labels}


def generate_pii_sample() -> dict:
    """Generate a sentence with one PII span embedded in natural context."""
    gen = random.choices(PII_GENERATORS, weights=PII_WEIGHTS)[0]
    pii_value, pii_type = gen()

    contexts = PII_CONTEXTS[pii_type]
    template = random.choice(contexts)

    # Build the sentence
    sentence = template.replace("{pii}", pii_value)

    # Sometimes prepend filler
    if random.random() < 0.5:
        sentence = random_filler() + " " + sentence
    # Sometimes append filler
    if random.random() < 0.4:
        sentence = sentence + " " + random_filler()

    return tokenize_and_label(sentence, pii_value, pii_type)


def generate_multi_pii_sample() -> dict:
    """Generate a sentence with 2-3 PII spans."""
    num = random.randint(2, 3)
    parts: list[str] = []
    pii_entries: list[tuple[str, str]] = []

    for i in range(num):
        if i > 0 or random.random() < 0.4:
            parts.append(random_filler())

        gen = random.choices(PII_GENERATORS, weights=PII_WEIGHTS)[0]
        pii_value, pii_type = gen()
        contexts = PII_CONTEXTS[pii_type]
        template = random.choice(contexts)
        parts.append(template.replace("{pii}", pii_value))
        pii_entries.append((pii_value, pii_type))

    if random.random() < 0.3:
        parts.append(random_filler())

    sentence = " ".join(parts)
    words = sentence.split()
    labels = ["O"] * len(words)

    # Tag each PII span
    for pii_value, pii_type in pii_entries:
        pii_words = pii_value.split()
        pii_len = len(pii_words)
        for i in range(len(words) - pii_len + 1):
            if labels[i] != "O":
                continue
            stripped = [re.sub(r'[.,;:!?\'")\]]+$', '', w) for w in words[i:i + pii_len]]
            pii_stripped = [re.sub(r'[.,;:!?\'")\]]+$', '', w) for w in pii_words]
            if stripped == pii_stripped:
                labels[i] = f"B-{pii_type}"
                for j in range(1, pii_len):
                    labels[i + j] = f"I-{pii_type}"
                break

    return {"words": words, "labels": labels}


def generate_negative_sample() -> dict:
    """Pure negative sample -- no PII at all."""
    parts = [random_filler()]
    if random.random() < 0.6:
        parts.append(random_filler())
    if random.random() < 0.3:
        parts.append(random_filler())
    text = " ".join(parts)
    words = text.split()
    return {"words": words, "labels": ["O"] * len(words)}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Pre-download name lists
    get_first_names()
    get_last_names()

    samples: list[dict] = []
    n_single = int(NUM_SAMPLES * 0.35)
    n_multi = int(NUM_SAMPLES * 0.15)
    n_negative = NUM_SAMPLES - n_single - n_multi

    print(f"Generating {n_single} single-PII, {n_multi} multi-PII, {n_negative} negative samples...")

    for _ in range(n_single):
        samples.append(generate_pii_sample())
    for _ in range(n_multi):
        samples.append(generate_multi_pii_sample())
    for _ in range(n_negative):
        samples.append(generate_negative_sample())

    random.shuffle(samples)

    # Validate
    for idx, s in enumerate(samples):
        assert len(s["words"]) == len(s["labels"]), f"Sample {idx}: {len(s['words'])} words vs {len(s['labels'])} labels"
        for lab in s["labels"]:
            assert lab in BIO_LABELS, f"Sample {idx}: unknown label '{lab}'"

    split = int(len(samples) * (1 - VAL_RATIO))
    train_data = samples[:split]
    val_data = samples[split:]

    with open(OUTPUT_DIR / "train.json", "w") as f:
        json.dump(train_data, f)
    with open(OUTPUT_DIR / "val.json", "w") as f:
        json.dump(val_data, f)
    with open(OUTPUT_DIR / "labels.json", "w") as f:
        json.dump(BIO_LABELS, f, indent=2)

    print(f"Generated {len(train_data)} training and {len(val_data)} validation samples")
    print(f"Saved to {OUTPUT_DIR}")

    type_counts: dict[str, int] = {}
    total_pii_words = 0
    total_o_words = 0
    for s in samples:
        for lab in s["labels"]:
            if lab.startswith("B-"):
                t = lab[2:]
                type_counts[t] = type_counts.get(t, 0) + 1
            if lab == "O":
                total_o_words += 1
            else:
                total_pii_words += 1
    print(f"PII span counts: {type_counts}")
    print(f"PII tokens: {total_pii_words}, O tokens: {total_o_words}, ratio: 1:{total_o_words // max(total_pii_words, 1)}")


if __name__ == "__main__":
    main()
