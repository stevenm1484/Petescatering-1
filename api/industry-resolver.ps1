function Resolve-Industry {
    param(
        [string]$PrimaryType,
        [string]$SearchIndustry
    )

    if (-not $PrimaryType) { return $SearchIndustry }

    $t = $PrimaryType.ToLowerInvariant()

    $rules = @(
        @{ pattern = 'plumb';                         industry = 'Plumbing' }
        @{ pattern = 'electric';                      industry = 'Electrical' }
        @{ pattern = 'hvac|heating|air conditioning'; industry = 'HVAC' }
        @{ pattern = 'roof';                          industry = 'Roofing' }
        @{ pattern = 'barber';                        industry = 'Barber' }
        @{ pattern = 'nail';                          industry = 'Nail Salon' }
        @{ pattern = 'hair salon|beauty salon|hair care'; industry = 'Hair Salon' }
        @{ pattern = 'car repair|auto repair|automotive|mechanic'; industry = 'Automotive' }
        @{ pattern = 'auto body|collision';           industry = 'Auto Body' }
        @{ pattern = 'towing|tow truck';              industry = 'Towing' }
        @{ pattern = 'landscap|lawn care|lawn service'; industry = 'Landscaping' }
        @{ pattern = 'tree service|arborist';         industry = 'Tree Service' }
        @{ pattern = 'clean';                         industry = 'Cleaning' }
        @{ pattern = 'pest';                          industry = 'Pest Control' }
        @{ pattern = 'locksmith';                     industry = 'Locksmith' }
        @{ pattern = 'moving|mover';                  industry = 'Moving' }
        @{ pattern = 'paint';                         industry = 'Painting' }
        @{ pattern = 'floor';                         industry = 'Flooring' }
        @{ pattern = 'pool';                          industry = 'Pool Service' }
        @{ pattern = 'concrete|paving|masonry';       industry = 'Construction' }
        @{ pattern = 'general contractor|handyman|home improv|remodel'; industry = 'Home Services' }
        @{ pattern = 'appliance';                     industry = 'Appliance Repair' }
        @{ pattern = 'restaurant|pizza|diner|grill|steakhouse|taqueria'; industry = 'Restaurants' }
        @{ pattern = 'bakery|cafe|coffee|food truck|catering'; industry = 'Food & Beverage' }
        @{ pattern = 'pet groom|dog groom|veterinar|animal hospital'; industry = 'Pet Services' }
        @{ pattern = 'florist|gift shop|thrift|furniture store|retail'; industry = 'Retail' }
        @{ pattern = 'day care|daycare|preschool|child care'; industry = 'Childcare' }
        @{ pattern = 'dentist|dental';                industry = 'Dental' }
        @{ pattern = 'chiropract|physical therap|medical|health'; industry = 'Healthcare' }
        @{ pattern = 'photograph|videograph';           industry = 'Creative Services' }
        @{ pattern = 'tax prepar|account|insurance|real estate|law firm|legal'; industry = 'Professional Services' }
        @{ pattern = 'gym|fitness|yoga|martial arts'; industry = 'Fitness' }
        @{ pattern = 'dry clean|laundromat|laundry';  industry = 'Laundry' }
        @{ pattern = 'spa|massage|wellness';          industry = 'Wellness' }
    )

    foreach ($rule in $rules) {
        if ($t -match $rule.pattern) { return $rule.industry }
    }

    return $SearchIndustry
}
