-- Add org-cleanup finalizer to existing organization resources
UPDATE resources 
SET finalizers = array_append(finalizers, 'org-cleanup')
WHERE kind = 'Organization' 
AND 'org-cleanup' != ANY(finalizers);
