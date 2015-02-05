#!/bin/bash
# Name substitution
word=$1
word_adjusted=${word/".wav"/"-adjusted.wav"}
word_trimmed=${word/".wav"/"-trimmed.wav"}

# get sound length
orig_length=`sox --i -D $word`

# increase volume
sox $word $word_adjusted vol `sox $word -n stat -v 2>&1` >/dev/null 2>/dev/null

# remove silence at end file
sox $word_adjusted $word_trimmed reverse silence 1 0.1 1% reverse

# get new sound length
new_length=`sox --i -D $word_trimmed`

# get ending silence length
silence_length=`python -c "print $orig_length - $new_length"`

# we need at least 0.02s silence
required_length=0.02
result=`echo $silence_length'>'$required_length | bc -l`
echo $result;

# clean up
rm $word_trimmed 2> /dev/null
rm $word_adjusted 2> /dev/null
