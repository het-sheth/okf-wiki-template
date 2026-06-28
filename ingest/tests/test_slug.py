from ingest.slug import slugify


def test_slugify_lowercases_and_hyphenates():
    assert slugify("System Design 101") == "system-design-101"


def test_slugify_strips_extension_and_punctuation():
    assert slugify("final-review-462 (1).ppt") == "final-review-462-1"


def test_slugify_collapses_repeats_and_trims():
    assert slugify("  Hello___World!!  ") == "hello-world"
